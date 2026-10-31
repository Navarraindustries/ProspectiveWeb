/* Registro de mandos de la paleta (⌘K). Un almacén de módulo, sin contexto de
   React: las pantallas registran lo suyo con `useRegisterCommands` y la paleta
   lo lee con `getCommands`/`subscribeCommands`. La paleta es un atajo: todo lo
   que hace tiene otro camino visible. */

import { useEffect, useRef } from "react";

export const OPEN_PALETTE_EVENT = "prospective:command-palette";

/** Pide a la paleta que se abra (la escucha el propio componente de la paleta). */
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
}

/** Los `id` deben ser únicos dentro de cada dueño. */
export interface Command {
  id: string;
  group: "ir" | "acciones" | "pasos";
  label: string;
  hint?: string;
  keywords?: string[];
  run: () => void;
  disabled?: boolean;
}

const owners = new Map<string, Command[]>();
const listeners = new Set<() => void>();

let snapshot: Command[] = [];

function notify() {
  snapshot = [...owners.values()].flat();
  listeners.forEach((fn) => fn());
}

/** Sustituye los mandos del dueño `owner`; devuelve el desregistro. Los `id`
    deben ser únicos dentro de cada dueño. */
export function registerCommands(owner: string, cmds: Command[]): () => void {
  owners.set(owner, cmds);
  notify();
  return () => {
    if (owners.get(owner) === cmds) {
      owners.delete(owner);
      notify();
    }
  };
}

export function getCommands(): Command[] {
  return snapshot;
}

export function subscribeCommands(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Registra `cmds` mientras el componente esté montado. Solo vuelve a registrar
    si cambia algún id, rótulo o `disabled`; los `run` se leen siempre de la
    última pasada (por una referencia), así no hay cierres viejos. */
export function useRegisterCommands(owner: string, cmds: Command[]): void {
  const latest = useRef(cmds);
  latest.current = cmds;
  const key = JSON.stringify(cmds.map((c) => [c.id, c.label, c.disabled]));
  useEffect(() => {
    const wrapped = latest.current.map((c) => ({
      ...c,
      run: () => (latest.current.find((x) => x.id === c.id) ?? c).run(),
    }));
    return registerCommands(owner, wrapped);
  }, [owner, key]);
}
