import { describe, expect, it } from "vitest";
import { isMotionMode, resolveReducedMotion } from "./accessibility";

describe("accessibility settings", () => {
  it("resolves motion preference from explicit setting or OS default", () => {
    expect(resolveReducedMotion("auto", true)).toBe(true);
    expect(resolveReducedMotion("auto", false)).toBe(false);
    expect(resolveReducedMotion("reduced", false)).toBe(true);
    expect(resolveReducedMotion("full", true)).toBe(false);
  });

  it("recognizes only supported motion modes", () => {
    expect(isMotionMode("auto")).toBe(true);
    expect(isMotionMode("reduced")).toBe(true);
    expect(isMotionMode("full")).toBe(true);
    expect(isMotionMode("off")).toBe(false);
  });
});
