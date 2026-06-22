import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom({ crash }: { crash: boolean }) {
  if (crash) throw new Error("kaboom");
  return <div>healthy</div>;
}

describe("ErrorBoundary", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <Boom crash={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("healthy")).toBeInTheDocument();
  });

  it("shows the fallback (with retry + reload) when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom crash />
      </ErrorBoundary>
    );
    expect(screen.getByText("アプリケーションエラーが発生しました")).toBeInTheDocument();
    expect(screen.getByText("kaboom")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再読み込み" })).toBeInTheDocument();
  });

  it("recovers without reload when resetKey changes (e.g. on navigation)", () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/broken">
        <Boom crash />
      </ErrorBoundary>
    );
    expect(screen.getByText("アプリケーションエラーが発生しました")).toBeInTheDocument();

    // Navigating elsewhere (new resetKey) clears the error and renders the new,
    // healthy view — no window.location.reload() needed.
    rerender(
      <ErrorBoundary resetKey="/ok">
        <Boom crash={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("healthy")).toBeInTheDocument();
    expect(screen.queryByText("アプリケーションエラーが発生しました")).not.toBeInTheDocument();
  });
});
