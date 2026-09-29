import { describe, expect, it } from "vitest";
import {
  defaultServerSessionPath,
  parseSessionFile,
  sessionFileName,
} from "./sessionFile";

describe("session file names", () => {
  const date = new Date(2026, 0, 5, 9, 7);

  it("uses a zero-padded, filesystem-safe timestamp", () => {
    expect(sessionFileName(date)).toBe("nt2gui-session_2026-01-05_09-07.json");
  });

  it("defaults server saves into the nt2gui folder", () => {
    expect(defaultServerSessionPath(date)).toBe(
      ".nt2gui/saved/nt2gui-session_2026-01-05_09-07.json",
    );
  });
});

describe("parseSessionFile", () => {
  it("returns the document for a session-shaped object", () => {
    const document = { schemaVersion: 1, state: { plotters: {} }, simulations: [] };
    expect(parseSessionFile(JSON.stringify(document))).toEqual(document);
  });

  it.each([
    ["invalid JSON", "{nope", /not valid JSON/],
    ["an array", "[]", /not an nt2gui session/],
    ["null", "null", /not an nt2gui session/],
    ["a missing state", '{"simulations": []}', /not an nt2gui session/],
    ["a non-object state", '{"state": 3}', /not an nt2gui session/],
  ])("rejects %s", (_label, text, message) => {
    expect(() => parseSessionFile(text)).toThrow(message);
  });
});
