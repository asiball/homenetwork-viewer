import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { EditView } from "./EditView";
import { CatalogContext, type CatalogValue } from "../CatalogContext";
import type { Device } from "../types";

vi.mock("../api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    oui: vi.fn().mockResolvedValue({ manufacturer: null }),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}));
import { api } from "../api";

const dev = (over: Partial<Device> = {}): Device => ({
  id: "nas",
  name: "NAS",
  host: "nas.home.arpa",
  ip: "192.168.1.20",
  mac: "AA:BB:CC:DD:EE:FF",
  group: "Infra",
  type: "nas",
  online: true,
  ...over,
});

const catalog = (devices: Device[]): CatalogValue => ({
  devices,
  switches: [],
  cables: [],
  meta: {
    total: devices.length,
    online: 0,
    offline: 0,
    updated_at: null,
    last_sweep: null,
    next_sweep: null,
    sweep_interval: 0,
  },
  selfId: null,
  lastSync: new Date(),
  loading: false,
  refreshing: false,
  syncError: null,
  refresh: vi.fn().mockResolvedValue(undefined),
  notify: vi.fn(),
});

function renderAdd(devices: Device[] = []) {
  const router = createMemoryRouter([{ path: "/add", element: <EditView mode="add" /> }], {
    initialEntries: ["/add"],
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CatalogContext.Provider value={catalog(devices)}>
        <RouterProvider router={router} />
      </CatalogContext.Provider>
    </QueryClientProvider>
  );
}

describe("EditView (add mode)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("renders the identity form and the add button", () => {
    renderAdd();
    expect(screen.getByLabelText(/display name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/ipv4/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "add device" })).toBeInTheDocument();
  });

  it("auto-suggests a kebab-case id from the typed name", async () => {
    const user = userEvent.setup();
    renderAdd();
    await user.type(screen.getByLabelText(/display name/), "My NAS");
    // Target the id input by its DOM id (the label "id" also fuzzy-matches the
    // "identity" section landmark).
    expect(document.getElementById("f-id")).toHaveValue("my-nas");
  });

  it("blocks submit and shows an inline error for an invalid IP", async () => {
    const user = userEvent.setup();
    renderAdd();
    await user.type(screen.getByLabelText(/display name/), "Box");
    await user.type(screen.getByLabelText(/host/), "box.home.arpa");
    await user.type(screen.getByLabelText(/^type/), "desktop");
    await user.type(screen.getByLabelText(/mac/), "AA:BB:CC:DD:EE:FF");
    await user.type(screen.getByLabelText(/ipv4/), "999.1.1.1");

    await user.click(screen.getByRole("button", { name: "add device" }));

    expect(screen.getByText(/IPv4 形式/)).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });
});

function renderEdit(devices: Device[], id: string) {
  const router = createMemoryRouter(
    [
      { path: "/d/:id/edit", element: <EditView mode="edit" /> },
      { path: "/d/:id", element: <div data-testid="detail-stub" /> },
    ],
    { initialEntries: [`/d/${id}/edit`] }
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CatalogContext.Provider value={catalog(devices)}>
        <RouterProvider router={router} />
      </CatalogContext.Provider>
    </QueryClientProvider>
  );
}

describe("EditView (edit mode) — delete failure and the unsaved-changes guard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("keeps the unsaved-changes guard active after a failed delete, instead of silently disabling it (#review item 7)", async () => {
    const user = userEvent.setup();
    vi.mocked(api.remove).mockRejectedValueOnce(new Error("boom"));
    renderEdit([dev()], "nas");

    // Make the form dirty first.
    await user.clear(screen.getByLabelText(/display name/));
    await user.type(screen.getByLabelText(/display name/), "NAS renamed");

    await user.click(screen.getByRole("button", { name: "delete" }));
    await user.click(screen.getByRole("button", { name: "削除" }));

    // The delete failed — its error is shown...
    expect(await screen.findByText(/削除に失敗しました/)).toBeInTheDocument();
    expect(api.remove).toHaveBeenCalledOnce();

    // ...and the dirty guard is still armed: navigating away (via "cancel",
    // which routes to /d/nas) must still be blocked and prompt to confirm,
    // exactly as it would have before the failed delete attempt. (The title
    // and message both contain "未保存の変更", so match the dialog by its
    // accessible name — the title — rather than the ambiguous text.)
    await user.click(screen.getByRole("link", { name: "cancel" }));

    expect(await screen.findByRole("dialog", { name: "未保存の変更" })).toBeInTheDocument();
    expect(screen.queryByTestId("detail-stub")).not.toBeInTheDocument();
  });
});
