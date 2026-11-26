/* Los roles de la cuenta y lo que permite cada uno.

   Vive aparte para que la barra superior y «Usuarios» digan lo mismo: quien
   elige un rol (o quien ve el suyo) debe saber qué cambia, no solo cómo se
   llama. Las frases salen de lo que el servidor hace hoy: pacientes propios en
   routers/patients.py y firma de pedidos en services/clip_orders.py
   (SIGNING_ROLES = médico y administrador). Si el servidor cambia, cambia aquí. */

/** Los roles que acepta el servidor (UserUpdate.role es un Literal allí). */
export type Rol = "admin" | "medico" | "residente" | "viewer";

export const ROLE_OPTS: { value: Rol; label: string }[] = [
  { value: "admin", label: "Administrador" },
  { value: "medico", label: "Médico" },
  { value: "residente", label: "Residente" },
  { value: "viewer", label: "Observador" },
];

/** Un rol que vino como texto (p. ej. de UserAdminInfo), ya acotado; si no es
 *  ninguno de los cuatro, el de menos permisos. */
export function comoRol(x: string | null | undefined): Rol {
  return ROLE_OPTS.some((r) => r.value === x) ? (x as Rol) : "viewer";
}

export const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_OPTS.map((r) => [r.value, r.label]));

export const ROLE_PERMITE: Record<string, string> = {
  admin: "Administrador: todos los pacientes, usuarios, cuentas pendientes, auditoría y catálogo de clips",
  medico: "Médico: ves y editas los pacientes que creas; firmas pedidos",
  residente: "Residente: ves y editas los pacientes que creas; no firmas pedidos",
  viewer: "Observador: ves y editas los pacientes que creas; no firmas pedidos",
};
