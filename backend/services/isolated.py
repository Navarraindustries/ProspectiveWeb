"""Correr un cálculo nativo pesado en un proceso aparte.

Por qué: VTK puede abortar el proceso sin excepción de Python (visto cuatro
veces en la auditoría, en «Sugerir corredor» y al restaurar una sesión). En
el proceso del servidor eso tumba uvicorn entero; en un hijo, solo falla la
petición y la persona recibe un 500 con explicación.

`fn` y sus argumentos viajan por pickle a un proceso `spawn`: `fn` tiene que
estar a nivel de módulo en un módulo importable desde `backend/`, y los
argumentos ser datos sencillos (el id de la sesión y parámetros; el hijo
vuelve a leer los ficheros), nunca objetos VTK. El pool se crea en cada
llamada, nunca al importar: un pool creado al importar se crearía también en
cada hijo que importe este módulo.
"""
from __future__ import annotations

import concurrent.futures as cf
import multiprocessing as mp
from concurrent.futures.process import BrokenProcessPool
from typing import Callable, TypeVar

T = TypeVar("T")
_CTX = mp.get_context("spawn")


class CalculoCaido(RuntimeError):
    """El proceso hijo murió (o se colgó) sin devolver resultado."""


def run_isolated(fn: Callable[..., T], *args, timeout_s: float = 600) -> T:
    pool = cf.ProcessPoolExecutor(max_workers=1, mp_context=_CTX)
    try:
        fut = pool.submit(fn, *args)
        try:
            return fut.result(timeout=timeout_s)
        except BrokenProcessPool as exc:
            raise CalculoCaido(str(exc)) from exc
        except cf.TimeoutError as exc:
            # Un hijo colgado no se va solo: salir del pool con `wait=True`
            # esperaría a que acabe, y el límite de tiempo no limitaría nada.
            _matar_hijos(pool)
            raise CalculoCaido(f"Sin respuesta en {timeout_s:.0f} s") from exc
    finally:
        pool.shutdown(wait=True, cancel_futures=True)


def _matar_hijos(pool: cf.ProcessPoolExecutor) -> None:
    for proc in list((getattr(pool, "_processes", None) or {}).values()):
        try:
            proc.kill()
        except Exception:  # noqa: BLE001 — puede haber muerto ya
            pass
