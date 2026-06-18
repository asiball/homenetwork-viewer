import { describe, it, expect } from "vitest";
import { isTypingTarget } from "./useGlobalKeydown";

function keyOn(tagName: string): KeyboardEvent {
  const el = document.createElement(tagName);
  const e = new KeyboardEvent("keydown", { key: "/" });
  // jsdom events have no live target until dispatched; define it directly.
  Object.defineProperty(e, "target", { value: el, configurable: true });
  return e;
}

describe("isTypingTarget (#165)", () => {
  it("is true for text-entry controls", () => {
    expect(isTypingTarget(keyOn("input"))).toBe(true);
    expect(isTypingTarget(keyOn("textarea"))).toBe(true);
    expect(isTypingTarget(keyOn("select"))).toBe(true);
  });

  it("is false elsewhere (so shortcuts still fire)", () => {
    expect(isTypingTarget(keyOn("button"))).toBe(false);
    expect(isTypingTarget(keyOn("div"))).toBe(false);
    expect(isTypingTarget(keyOn("a"))).toBe(false);
  });
});
