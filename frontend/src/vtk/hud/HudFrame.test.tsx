import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HudFrame } from "./HudFrame";

describe("HudFrame", () => {
  it("keeps interactive children reachable and never hides the frame itself", () => {
    const { container } = render(
      <HudFrame>
        <button>X</button>
      </HudFrame>,
    );
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveAttribute("aria-hidden");
  });
});
