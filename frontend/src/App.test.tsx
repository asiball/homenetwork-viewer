import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { useCatalog } from "./CatalogContext";
import { RefreshControls } from "./components/RefreshControls";
import type { Device } from "./types";

vi.mock("./api", () => ({
  api: {
    devices: vi.fn(),
    switches: vi.fn(),
    cables: vi.fn(),
    meta: vi.fn(),
    whoami: vi.fn(),
  },
}));
import { api } from "./api";

const seed: Device[] = [
  {
    id: "gw",
    name: "Gateway",
    host: "gw.home.arpa",
    ip: "192.168.1.1",
    mac: "AA:BB:CC:00:00:01",
    group: "Infra",
    type: "router",
    online: true,
  },
];

// Probe renders the catalog the way views consume it, plus RefreshControls —
// which drives the `lastSync` pulse effect. If `lastSync` weren't a stable
// reference, that effect would loop and React would throw "Maximum update
// depth exceeded", failing this test.
function Probe() {
  const { devices, loading, meta } = useCatalog();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="count">{devices.length}</span>
      <span data-testid="online">{meta.online}</span>
      <RefreshControls />
      {devices.map((d) => (
        <span key={d.id}>{d.name}</span>
      ))}
    </div>
  );
}

function renderApp() {
  const router = createMemoryRouter(
    [{ element: <App />, children: [{ index: true, element: <Probe /> }] }],
    { initialEntries: ["/"] },
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("App catalog provider (react-query)", () => {
  beforeEach(() => {
    vi.mocked(api.devices).mockReset();
    vi.mocked(api.switches).mockReset();
    vi.mocked(api.cables).mockReset();
    vi.mocked(api.meta).mockReset();
    vi.mocked(api.whoami).mockReset();
  });

  it("loads the catalog and exposes it to views", async () => {
    vi.mocked(api.devices).mockResolvedValue(seed);
    vi.mocked(api.switches).mockResolvedValue([]);
    vi.mocked(api.cables).mockResolvedValue([]);
    vi.mocked(api.meta).mockResolvedValue({ total: 1, online: 1, offline: 0, updated_at: null });
    vi.mocked(api.whoami).mockResolvedValue({ ip: null });

    renderApp();

    // First paint shows the full-screen loader, then resolves to the catalog.
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    expect(screen.getByTestId("online")).toHaveTextContent("1");
    expect(screen.getByText("Gateway")).toBeInTheDocument();
  });

  it("shows the boot-error screen when the initial load fails", async () => {
    vi.mocked(api.devices).mockRejectedValue(new Error("API down"));
    vi.mocked(api.switches).mockResolvedValue([]);
    vi.mocked(api.cables).mockResolvedValue([]);
    vi.mocked(api.meta).mockResolvedValue({ total: 0, online: 0, offline: 0, updated_at: null });
    vi.mocked(api.whoami).mockResolvedValue({ ip: null });

    renderApp();

    await waitFor(() => expect(screen.getByText("couldn't load catalog")).toBeInTheDocument());
    expect(screen.getByText("API down")).toBeInTheDocument();
  });
});
