import { describe, expect, it } from "vitest";
import { beginRender, rendersPending } from "./renderActivity";

describe("renderActivity", () => {
  it("tracks pending renders per scope", () => {
    const a1 = beginRender("a");
    const a2 = beginRender("a");
    const b = beginRender("b");
    const inA = (scope: string) => scope === "a";
    const inC = (scope: string) => scope === "c";

    expect(rendersPending()).toBe(true);
    expect(rendersPending(inA)).toBe(true);
    expect(rendersPending(inC)).toBe(false);

    a1();
    a1(); // ending twice is harmless
    expect(rendersPending(inA)).toBe(true);
    a2();
    expect(rendersPending(inA)).toBe(false);
    expect(rendersPending()).toBe(true);
    b();
    expect(rendersPending()).toBe(false);
  });
});
