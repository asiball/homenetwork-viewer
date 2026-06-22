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

const catalog = (devices: Device[]): CatalogValue => ({
  devices,
  switches: [],
  cables: [],
  meta: { total: devices.length, online: 0, offline: 0, updated_at: null },
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
