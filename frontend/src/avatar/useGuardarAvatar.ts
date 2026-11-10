/* Guardar el avatar: lógica común de «Tu avatar» (hoja) y del paso de
   bienvenida. La foto elegida en «Desde mi foto» no sale del navegador hasta
   guardar, y solo si el modo final es «foto». */
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../store/auth";
import type { ResultadoFoto } from "./DesdeMiFoto";
import type { AvatarConfig } from "./config";

export type ModoAvatar = "avatar" | "foto";
export type FotoPendiente = { foto: Blob | null; usarRegistro: boolean };

export function useGuardarAvatar() {
  const { refreshUser } = useAuth();
  const [pendiente, setPendiente] = useState<FotoPendiente | null>(null);
  const [vistaPendiente, setVistaPendiente] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendiente?.foto || typeof URL.createObjectURL !== "function") { setVistaPendiente(null); return; }
    const u = URL.createObjectURL(pendiente.foto);
    setVistaPendiente(u);
    return () => URL.revokeObjectURL?.(u);
  }, [pendiente]);

  /** Aplica el resultado de «Desde mi foto»; devuelve el modo elegido. */
  const aplicarFoto = useCallback((r: ResultadoFoto) => {
    setError(null);
    setPendiente(r.mostrar === "foto" ? { foto: r.foto, usarRegistro: !!r.usarRegistro } : null);
  }, []);

  /** Sube/copia la foto si hace falta, guarda y refresca. true si salió bien. */
  const guardar = useCallback(async (config: AvatarConfig, modo: ModoAvatar): Promise<boolean> => {
    setBusy(true); setError(null);
    try {
      if (modo === "foto" && pendiente) {
        if (pendiente.usarRegistro) await api.copyRegistroPhoto();
        else if (pendiente.foto) await api.uploadProfilePhoto(pendiente.foto);
        setPendiente(null);
      }
      await api.saveAvatar(config, modo);
      await refreshUser();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el avatar");
      return false;
    } finally {
      setBusy(false);
    }
  }, [pendiente, refreshUser]);

  return { pendiente, vistaPendiente, busy, error, setError, setBusy, setPendiente, aplicarFoto, guardar };
}
