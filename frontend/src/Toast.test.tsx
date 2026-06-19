import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { useCatalog } from "./CatalogContext";

vi.mock("./api", () => ({
  api: {
    devices: vi.fn().mockResolvedValue([]),
    switches: vi.fn().mockResolvedValue([]),
    cables: vi.fn().mockResolvedValue([]),
    meta: vi.fn().mockResolvedValue({ total: 0, online: 0, offline: 0, updated_at: null }),
    whoami: vi.fn().mockResolvedValue({ ip: null }),
  },
}));

// A tiny consumer that fires notifications on demand.
function Notifier() {
  const { notify } = useCatalog();
  return (
    <div>
      <button onClick={() => notify("first message", "ok")}>fire-ok</button>
      <button onClick={() => notify("an error", "err")}>fire-err</button>
    </div>
  );
}

function renderApp() {
  const router = createMemoryRouter(
    [{ element: <App />, children: [{ index: true, element: <Notifier /> }] }],
    { initialEntries: ["/"] }
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

describe("toast stack (#166)", () => {
  beforeEach(() => localStorage.clear());

  it("stacks successive toasts instead of overwriting", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText("fire-ok");

    await user.click(screen.getByText("fire-ok"));
    await user.click(screen.getByText("fire-err"));

    // Both are visible at once (the success isn't clobbered by the error).
    expect(screen.getByText("first message")).toBeInTheDocument();
    expect(screen.getByText("an error")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("an error");
  });

  it("lets a toast be dismissed individually", async () => {
    const user = userEvent.setup();
    renderApp();
    await screen.findByText("fire-err");
    await user.click(screen.getByText("fire-err"));

    expect(screen.getByText("an error")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(screen.queryByText("an error")).not.toBeInTheDocument();
  });
});
