import { describe, expect, it } from "vitest";
import { UsageCache } from "../src/cache.js";
import type { AccountSnapshot } from "../src/types.js";

const account: AccountSnapshot = {
  id: "minimax-cn",
  label: "MiniMax Token Plan · 国内站",
  configured: true,
  ok: true,
  entries: [
    {
      name: "general",
      included: true,
      windows: [{ key: "interval", label: "5h", title: "5 小时窗口", remainingPercent: 80 }],
    },
  ],
};

describe("UsageCache", () => {
  it("returns a fresh entry inside the TTL", () => {
    const cache = new UsageCache(1000);
    cache.set("minimax-cn", account, 10_000);
    expect(cache.get("minimax-cn", 10_500)?.account.entries[0]?.windows[0]?.remainingPercent).toBe(80);
  });

  it("expires after the TTL", () => {
    const cache = new UsageCache(1000);
    cache.set("minimax-cn", account, 10_000);
    expect(cache.get("minimax-cn", 11_001)).toBeUndefined();
  });

  it("peek still returns an expired entry", () => {
    const cache = new UsageCache(1000);
    cache.set("minimax-cn", account, 10_000);
    expect(cache.peek("minimax-cn")?.at).toBe(10_000);
    expect(cache.get("minimax-cn", 20_000)).toBeUndefined();
  });

  it("clear drops every account", () => {
    const cache = new UsageCache(1000);
    cache.set("minimax-cn", account, 10_000);
    cache.set("minimax-global", { ...account, id: "minimax-global" }, 10_000);
    cache.clear();
    expect(cache.peek("minimax-cn")).toBeUndefined();
    expect(cache.peek("minimax-global")).toBeUndefined();
  });
});
