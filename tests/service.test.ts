import { describe, expect, it } from "vitest";
import { UsageService } from "../src/service.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const minimaxPayload = (percent: number) => ({
  model_remains: [
    { model_name: "general", current_interval_remaining_percent: percent },
  ],
  base_resp: { status_code: 0, status_msg: "success" },
});

describe("UsageService", () => {
  it("reports unconfigured when no keys exist", async () => {
    const service = new UsageService({ get: () => undefined }, { env: {} });
    service.markReady();
    const snap = await service.snapshot();
    expect(snap.accounts).toEqual([]);
    expect(snap.error).toMatch(/未配置/);
  });

  it("reuses a successful snapshot inside the cache TTL", async () => {
    let calls = 0;
    const service = new UsageService(
      { get: () => undefined },
      {
        env: { MINIMAX_API_KEY: "sk-global" },
        fetchImpl: async () => {
          calls += 1;
          return jsonResponse(minimaxPayload(70));
        },
      },
    );
    service.markReady();
    const first = await service.snapshot(false, "startup");
    const second = await service.snapshot(false, "startup");
    expect(calls).toBe(1);
    expect(first.accounts[0]?.entries[0]?.windows[0]?.remainingPercent).toBe(70);
    expect(second.accounts[0]?.entries[0]?.windows[0]?.remainingPercent).toBe(70);
  });

  it("force refresh bypasses the cache", async () => {
    let calls = 0;
    const service = new UsageService(
      { get: () => undefined },
      {
        env: { MINIMAX_API_KEY: "sk-global" },
        fetchImpl: async () => {
          calls += 1;
          return jsonResponse(minimaxPayload(calls === 1 ? 70 : 40));
        },
      },
    );
    service.markReady();
    await service.snapshot();
    const refreshed = await service.snapshot(true);
    expect(calls).toBe(2);
    expect(refreshed.accounts[0]?.entries[0]?.windows[0]?.remainingPercent).toBe(40);
  });

  it("keeps the last good snapshot when a later fetch fails", async () => {
    let calls = 0;
    const service = new UsageService(
      { get: () => undefined },
      {
        env: { MINIMAX_CN_API_KEY: "sk-cn" },
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) return jsonResponse(minimaxPayload(88));
          return jsonResponse({ error: "boom" }, 500);
        },
      },
    );
    service.markReady();
    await service.snapshot();
    const failed = await service.snapshot(true);
    expect(failed.accounts[0]?.ok).toBe(true);
    expect(failed.accounts[0]?.stale).toBe(true);
    expect(failed.accounts[0]?.entries[0]?.windows[0]?.remainingPercent).toBe(88);
    expect(failed.accounts[0]?.error).toMatch(/可能过期/);
  });

  it("returns a 'init' snapshot while prewarming and never caches it", async () => {
    const service = new UsageService({ get: () => undefined }, { env: {} });
    const first = await service.snapshot(false, "startup");
    expect(first.phase).toBe("init");
    expect(first.error).toBeUndefined();
    expect(first.accounts).toEqual([]);

    const second = await service.snapshot(false, "startup");
    expect(second.phase).toBe("init");
  });

  it("prewarm resolves a configured key into a cached snapshot", async () => {
    let calls = 0;
    const service = new UsageService(
      { get: () => undefined },
      {
        env: { MINIMAX_CN_API_KEY: "sk-cn" },
        fetchImpl: async () => {
          calls += 1;
          return jsonResponse(minimaxPayload(77));
        },
      },
    );

    await service.prewarm(50);
    expect(service["phase"]).toBe("ready");

    const snap = await service.snapshot(false, "startup");
    expect(snap.phase).toBe("ready");
    expect(snap.error).toBeUndefined();
    expect(snap.accounts[0]?.entries[0]?.windows[0]?.remainingPercent).toBe(77);
    expect(calls).toBe(1);
  });

  it("prewarm timeout without keys leaves phase=ready and the next call returns UNCONFIGURED", async () => {
    const service = new UsageService({ get: () => undefined }, { env: {} });
    await service.prewarm(30);
    expect(service["phase"]).toBe("ready");

    const snap = await service.snapshot(false, "startup");
    expect(snap.phase).toBe("ready");
    expect(snap.error).toMatch(/未配置/);
  });

  it("reports every configured subscription, each in its own account", async () => {
    const service = new UsageService(
      { get: () => undefined },
      {
        env: { OPENCODE_GO_API_KEY: "sk-go", GLM_API_KEY: "sk-glm" },
        fetchImpl: async (url) => {
          if (url.includes("opencode.ai")) {
            return jsonResponse({ usage: { weekly: { percent: 46 } } });
          }
          return jsonResponse({
            success: true,
            data: { level: "pro", limits: [{ type: "TOKENS_LIMIT", unit: 3, percentage: 15 }] },
          });
        },
      },
    );
    service.markReady();
    const snap = await service.snapshot();
    expect(snap.accounts.map((account) => account.id)).toEqual(["opencode-go", "glm"]);
    expect(snap.accounts[0]?.entries[0]?.windows[0]?.remainingPercent).toBe(54);
    expect(snap.accounts[1]?.entries[0]?.windows[0]?.remainingPercent).toBe(85);
  });
});
