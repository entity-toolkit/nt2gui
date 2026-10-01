import { describe, expect, it } from "vitest";
import { apiBaseFor, normalizeServerUrl, serverFromLink } from "./config";

describe("normalizeServerUrl", () => {
  it.each([
    ["", ""],
    ["   ", ""],
    ["http://localhost:8765", "http://localhost:8765"],
    ["http://localhost:8765/", "http://localhost:8765"],
    ["localhost:8765", "http://localhost:8765"],
    [
      "https://Example.org/user/proxy/8765//",
      "https://example.org/user/proxy/8765",
    ],
  ])("%j -> %j", (text, expected) => {
    expect(normalizeServerUrl(text)).toBe(expected);
  });

  it.each([
    ["ftp://host", /http:\/\/ or https/],
    ["http://", /Not a valid URL/],
    ["http://host?x=1", /query/],
  ])("rejects %j", (text, message) => {
    expect(() => normalizeServerUrl(text)).toThrow(message);
  });
});

describe("apiBaseFor", () => {
  it("is relative for this page's server and absolute otherwise", () => {
    expect(apiBaseFor("")).toBe("api");
    expect(apiBaseFor("http://localhost:8765")).toBe(
      "http://localhost:8765/api",
    );
  });
});

describe("serverFromLink", () => {
  it("reads ?server= and drops it from the address", () => {
    expect(
      serverFromLink(
        "http://localhost:8766/?server=http%3A%2F%2Flocalhost%3A8765&x=1",
      ),
    ).toEqual({
      server: "http://localhost:8765",
      cleanHref: "http://localhost:8766/?x=1",
    });
  });

  it("ignores links without (or with an invalid) server", () => {
    expect(serverFromLink("http://localhost:8766/")).toBeNull();
    expect(
      serverFromLink("http://localhost:8766/?server=ftp%3A%2F%2Fx"),
    ).toBeNull();
  });

  it("accepts an empty server (back to this page's server)", () => {
    expect(serverFromLink("http://localhost:8766/?server=")).toEqual({
      server: "",
      cleanHref: "http://localhost:8766/",
    });
  });
});
