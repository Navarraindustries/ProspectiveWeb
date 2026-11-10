/* Contrato común de los momentos del flujo. */
export interface PropsMomento {
  nombre: string;
  /** Un momento puede pedir correr algo (p. ej. guardar) antes de que «Siguiente» avance;
      la función devuelve false si no hay que avanzar. */
  registrarAvance: (fn: (() => Promise<boolean>) | null) => void;
}
