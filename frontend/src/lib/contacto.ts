/* A quién escribir cuando algo no se puede resolver desde la pantalla.

   Una sola dirección para «Entrar», «Crear cuenta» y los avisos de cuenta
   bloqueada: antes cada texto decía «contacta al administrador» sin decir cómo.
   El backend repite la misma dirección en backend/services/auth_service.py
   (CONTACTO_ADMIN); si cambia, cambian las dos. */
export const CONTACTO_ADMIN = "ingprospective@skullapp.tech";
