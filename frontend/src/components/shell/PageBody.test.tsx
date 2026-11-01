import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { PageBody } from "./PageBody";

it("lista: desplaza y limita el ancho", () => {
  const { container } = render(<PageBody className="fade-rise"><p>x</p></PageBody>);
  const cuerpo = container.querySelector(".page-body")!;
  expect(cuerpo).toHaveAttribute("data-modo", "lista");
  expect(cuerpo.firstElementChild).toHaveClass("page-body__ancho", "fade-rise");
});
it("CSS: --content-max y márgenes por punto de corte (1024 y 640)", () => {
  const css = readFileSync(join(__dirname, "shell.css"), "utf8");
  expect(css).toMatch(/\.page-body__ancho\s*\{[^}]*max-width:\s*var\(--content-max\)[^}]*padding:\s*28px 32px 48px/);
  expect(css).toMatch(/@media \(max-width: 1024px\)\s*\{\s*\.page-body__ancho\s*\{\s*padding:\s*24px 24px 40px/);
  expect(css).toMatch(/@media \(max-width: 640px\)\s*\{\s*\.page-body__ancho\s*\{\s*padding:\s*16px 16px 32px/);
});
it("ninguna página interna lleva ancho propio y todas usan PageBody", () => {
  const PAGINAS = ["UsersAdmin", "PendingRequests", "AuditTrail", "Studies", "Patients", "Workshops", "ClipOrders", "PatientPage"];
  for (const p of PAGINAS) {
    const src = readFileSync(join(__dirname, `../../pages/${p}.tsx`), "utf8");
    expect(src, p).toMatch(/<PageBody[\s>]/);
    expect(src, p).not.toMatch(/maxWidth:\s*(?:"var\(--content-max\)"|(?:900|1000|1100|1320|1440)\b)/);
  }
});
