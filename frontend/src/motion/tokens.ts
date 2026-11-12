// Espejo en TypeScript de los tokens CSS --dur-1..4, --ease-out y --ease-in-out (en segundos, como usa `motion`).
export const DUR = { respuesta: 0.12, estado: 0.24, panel: 0.48, landing: 0.9 } as const;

export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** --ease-in-out: para lo que se desplaza dentro de la pantalla (la cámara 3D). */
export const EASE_EN_MOVIMIENTO: [number, number, number, number] = [0.4, 0, 0.2, 1];
