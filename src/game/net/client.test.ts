import { describe, expect, it } from "vitest";
import { formatJoinError, healthUrlForEndpoint, waitForServerHealth } from "./client";

describe("online client cold-start handling", () => {
  it("derives a health URL from Colyseus endpoints", () => {
    expect(healthUrlForEndpoint("wss://magnet-marbles-server.onrender.com")).toBe(
      "https://magnet-marbles-server.onrender.com/health",
    );
    expect(healthUrlForEndpoint("ws://127.0.0.1:2567")).toBe("http://127.0.0.1:2567/health");
    expect(healthUrlForEndpoint("https://magnet-marbles-server.onrender.com/matchmake")).toBe(
      "https://magnet-marbles-server.onrender.com/health",
    );
  });

  it("retries health checks until the backend wakes", async () => {
    let calls = 0;
    await waitForServerHealth("https://example.test", {
      timeoutMs: 100,
      pollMs: 0,
      fetchImpl: async () => {
        calls++;
        return { ok: calls >= 3, status: calls >= 3 ? 200 : 503 };
      },
    });

    expect(calls).toBe(3);
  });

  it("reports a clear wake timeout", async () => {
    await expect(
      waitForServerHealth("https://example.test", {
        timeoutMs: 1,
        pollMs: 0,
        fetchImpl: async () => {
          throw new Error("offline");
        },
      }),
    ).rejects.toThrow("Online server did not wake");
  });

  it("normalizes browser network events into retryable online copy", () => {
    const progressEventLike = { [Symbol.toStringTag]: "ProgressEvent" };
    expect(formatJoinError(progressEventLike, false)).toBe(
      "Online server is waking or unreachable. Wait a moment, then retry.",
    );
    expect(formatJoinError(new Error("socket hang up"), false)).toBe(
      "Online server is waking or unreachable. Wait a moment, then retry.",
    );
    expect(formatJoinError(new Error("not found"), true)).toBe("Room not found. Check the code and retry.");
  });
});
