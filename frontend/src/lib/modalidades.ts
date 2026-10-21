/* Imágenes diagnósticas de un caso para mostrar en la ficha. «Angio» y «Pangio» se
   solapaban (F2-40): el formulario tiene una sola casilla, «Angiografía por catéter».
   Los casos antiguos pueden traer cualquiera de las dos marcas; ambas se leen como la misma. */

export function modalidadesDe(st: { mod_tac?: boolean; mod_angio?: boolean; mod_rm?: boolean; mod_pangio?: boolean }): string {
  return [
    st.mod_tac && "TAC",
    (st.mod_angio || st.mod_pangio) && "Angiografía por catéter",
    st.mod_rm && "RM",
  ].filter(Boolean).join(" · ");
}
