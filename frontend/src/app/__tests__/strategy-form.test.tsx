import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";

describe("strategy form", () => {
  it("renders storageRoot and backtestLogHash inputs", async () => {
    const { default: Home } = await import("../page");
    render(<Home />);

    expect(screen.getByLabelText(/Storage Root/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Backtest Log Hash/i)).toBeInTheDocument();
  });
});
