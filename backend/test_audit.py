"""Tests for the tamper-evident audit trail (Feature 5)."""
from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="prospective_audit_")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_tmp}/test.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-do-not-use-in-production")

from fastapi.testclient import TestClient

from main import app
from services.database import Base, engine
from services.audit import SkullChain

Base.metadata.create_all(bind=engine)
client = TestClient(app, raise_server_exceptions=True)


class TestSkullChainUnit:
    def _chain(self) -> SkullChain:
        path = Path(tempfile.mkdtemp(prefix="chain_")) / "chain.db"
        return SkullChain(db_path=path)

    def test_genesis_and_append(self):
        c = self._chain()
        blocks = c.get_all_blocks()
        assert len(blocks) == 1 and blocks[0]["action"] == "GENESIS"
        h = c.append("LOGIN", {"role": "admin"}, username="admin")
        assert len(h) == 64
        assert len(c.get_all_blocks()) == 2

    def test_verify_ok(self):
        c = self._chain()
        for i in range(5):
            c.append("SEGMENTATION_COMPLETE", {"i": i}, username="u")
        ok, broken = c.verify_integrity()
        assert ok is True and broken == []

    def test_tamper_detected(self):
        c = self._chain()
        for i in range(3):
            c.append("REPORT_GENERATED", {"i": i}, username="u")
        # Tamper directly in the DB: change a payload without fixing the hash chain.
        conn = sqlite3.connect(str(c._path))
        conn.execute("UPDATE blocks SET payload_json='{\"i\": 999}' WHERE id = 3")
        conn.commit()
        conn.close()
        c2 = SkullChain(db_path=c._path)
        ok, broken = c2.verify_integrity()
        assert ok is False
        assert any(b["id"] == 3 for b in broken)


class TestAuditEndpoints:
    def test_append_and_list(self):
        r = client.post("/api/audit", json={"action": "DEVICE_PLACED", "payload": {"clip": "Yasargil"}, "username": "admin"})
        assert r.status_code == 200
        assert len(r.json()["block_hash"]) == 64
        blocks = client.get("/api/audit/blocks").json()
        assert len(blocks) >= 2
        assert any(b["action"] == "DEVICE_PLACED" for b in blocks)

    def test_verify_endpoint(self):
        d = client.get("/api/audit/verify").json()
        assert d["ok"] is True
        assert d["total_blocks"] >= 1

    def test_export_txt(self):
        r = client.get("/api/audit/export")
        assert r.status_code == 200
        assert "SkullChain Audit Trail" in r.text


class TestTwoWritersDoNotForkTheChain:
    """A tamper-evident log that breaks under ordinary concurrency cries wolf.

    Two writers appending at once can each read the tip and then write a block
    claiming it as predecessor. `verify_integrity` then reports a break with
    nobody having tampered with anything — the one signal that should mean
    "someone edited the record" starts meaning "two things happened at once".
    Not hypothetical: it is how this project's development chain acquired two
    prev_hash mismatches, both stamped at the minute two test suites ran
    concurrently against it.

    **What these tests do and do not prove.** They are regression guards on the
    property that matters — interleaved appends leave a chain that verifies —
    and they pass. They are NOT a reproduction of the race: the original code
    survives them too, because CPython holds a shared lock on the connection
    until a SELECT's cursor is reset, which serialises the two writers by
    accident in a single process. Reproducing the fork needs separate processes
    and unlucky timing, which is exactly how it turned up in the wild. The fix
    (BEGIN IMMEDIATE, so the write lock is taken BEFORE the tip is read) is
    correct on its own terms rather than because a test caught it.
    """

    def _pair(self):
        path = Path(tempfile.mkdtemp(prefix="chain_concurrent_")) / "chain.db"
        return SkullChain(db_path=path), SkullChain(db_path=path)

    def test_a_writer_held_mid_append_does_not_let_another_fork_the_chain(self):
        import threading

        a, b = self._pair()
        a.append("LOGIN", {"seed": True}, username="u")

        reading = threading.Event()
        b_done = threading.Event()
        real_last_hash = a._last_hash

        def slow_last_hash():
            tip = real_last_hash()
            reading.set()
            # With the fix this wait always times out, because B cannot get in.
            b_done.wait(timeout=3.0)
            return tip

        a._last_hash = slow_last_hash

        def writer_b():
            reading.wait(timeout=3.0)
            b.append("LOGIN", {"who": "b"}, username="u")
            b_done.set()

        t = threading.Thread(target=writer_b)
        t.start()
        a.append("LOGIN", {"who": "a"}, username="u")
        t.join(timeout=10.0)
        assert not t.is_alive(), "el segundo escritor se quedó bloqueado"

        ok, broken = a.verify_integrity()
        assert ok is True, f"la cadena se bifurcó con dos escritores: {broken[:3]}"
        assert len(a.get_all_blocks()) == 4, "genesis + semilla + A + B"

    def test_many_interleaved_appends_stay_verifiable(self):
        import threading

        a, b = self._pair()
        errors: list[Exception] = []

        def hammer(chain, tag):
            try:
                for i in range(20):
                    chain.append("SEGMENTATION_COMPLETE", {"t": tag, "i": i}, username="u")
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        threads = [threading.Thread(target=hammer, args=(a, "a")),
                   threading.Thread(target=hammer, args=(b, "b"))]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert not errors, errors[0]
        ok, broken = a.verify_integrity()
        assert ok is True, f"la cadena se bifurcó: {broken[:3]}"
        assert len(a.get_all_blocks()) == 41, "genesis + 40 bloques"
