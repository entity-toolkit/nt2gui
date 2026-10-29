// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isPlainKey, isTyping } from "./keyboard";

const input = (type: string) => {
  const element = document.createElement("input");
  element.type = type;
  return element;
};

describe("isTyping", () => {
  it("is true in text boxes and menus", () => {
    expect(isTyping(input("text"))).toBe(true);
    expect(isTyping(input("number"))).toBe(true);
    expect(isTyping(document.createElement("textarea"))).toBe(true);
    expect(isTyping(document.createElement("select"))).toBe(true);
  });

  it("is false on buttons, toggles, sliders and elsewhere", () => {
    expect(isTyping(input("checkbox"))).toBe(false);
    expect(isTyping(input("range"))).toBe(false);
    expect(isTyping(document.createElement("button"))).toBe(false);
    expect(isTyping(document.body)).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});

describe("isPlainKey", () => {
  it("rejects Ctrl, Cmd and Alt but not Shift", () => {
    expect(isPlainKey(new KeyboardEvent("keydown", { key: "F" }))).toBe(true);
    expect(
      isPlainKey(new KeyboardEvent("keydown", { key: "F", shiftKey: true })),
    ).toBe(true);
    expect(
      isPlainKey(new KeyboardEvent("keydown", { key: "f", ctrlKey: true })),
    ).toBe(false);
    expect(
      isPlainKey(new KeyboardEvent("keydown", { key: "f", metaKey: true })),
    ).toBe(false);
  });
});
