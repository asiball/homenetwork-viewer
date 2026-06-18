import { describe, it, expect } from "vitest";
import { APP_VERSION } from "./version";
import pkg from "../package.json";

describe("APP_VERSION (#173)", () => {
  it("is derived from package.json as v<version>, not hand-maintained", () => {
    expect(APP_VERSION).toBe(`v${pkg.version}`);
    expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d+/);
  });
});
