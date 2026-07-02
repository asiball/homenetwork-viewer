import { describe, it, expect, vi, afterEach } from "vitest";
import { api } from "./api";

function mockFetchOnce(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("api.wake", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends X-Requested-With, matching the /import CSRF guard (#backend wake guard)", async () => {
    const fetchMock = mockFetchOnce({ status: "sent", mac: "AA:BB:CC:DD:EE:FF" });
    await api.wake("nas");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/devices/nas/wake");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
  });
});

describe("api.scan", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs /scan with X-Requested-With, same CSRF guard as /wake (#review item 11)", async () => {
    const fetchMock = mockFetchOnce({ status: "scheduled" }, 202);
    await api.scan();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/scan");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
  });
});
