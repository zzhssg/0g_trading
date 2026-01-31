import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

describe("verify form", () => {
  it("renders strategy code and market data inputs", async () => {
    const { default: Home } = await import("../page");
    render(<Home />);

    expect(screen.getByLabelText(/^Strategy Code$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Market Data JSON/i)).toBeInTheDocument();
  });
});
