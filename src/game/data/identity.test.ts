import { describe, expect, it } from "vitest";
import { goalMarker, identityPipCount, playerMarker } from "./identity";

describe("identity markers", () => {
  it("gives each slot a color-independent player marker", () => {
    expect(playerMarker(0)).toBe("P1");
    expect(playerMarker({ id: 3 })).toBe("P4");
  });

  it("adds team context for team-bank goals", () => {
    expect(goalMarker(0, 0, false)).toBe("P1");
    expect(goalMarker(2, 0, true)).toBe("T1 P3");
  });

  it("maps identities to one-to-four mesh pips for world readability", () => {
    expect(identityPipCount(0)).toBe(1);
    expect(identityPipCount({ id: 3 })).toBe(4);
    expect(identityPipCount(99)).toBe(4);
  });
});
