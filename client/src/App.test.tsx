import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import App from "./App";

describe("страница (RTL seam)", () => {
  test("главная страница открывается и показывает название приложения", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: "Calendar" }),
    ).toBeInTheDocument();
  });
});
