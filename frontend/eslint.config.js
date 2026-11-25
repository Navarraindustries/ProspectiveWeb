// ESLint: por ahora solo las reglas de los hooks de React. El código tenía
// decenas de comentarios que desactivan `exhaustive-deps` sin nadie que la
// pasara; ahora la integración continua la pasa. `--max-warnings 0`: un aviso
// nuevo rompe el paso, así que una dependencia que falta se arregla o se
// justifica con su comentario, a la vista.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "src/api/schema.gen.ts", "coverage/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "react-hooks": reactHooks },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);
