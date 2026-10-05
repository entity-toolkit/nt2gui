import { describe, expect, it } from "vitest";
import { simulationName } from "./simulations";

describe("simulationName", () => {
  it("prefers the name, else the end of the path", () => {
    expect(simulationName({ id: "a", path: "/data/run/", name: "shock" })).toBe(
      "shock",
    );
    expect(simulationName({ id: "a", path: "/data/run/" })).toBe("run");
    expect(simulationName({ id: "a", path: "demo:run" })).toBe("demo:run");
  });
});
