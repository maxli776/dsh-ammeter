import { describe, expect, it } from "vitest";
import { accountSpec } from "../src/accounts.js";
import {
  mapHttpError,
  normalizeGlmQuotaPayload,
  normalizeOpenCodeGoPayload,
  normalizeRemainsPayload,
} from "../src/normalize.js";

const NOW = 1_700_000_000_000;
const CN = accountSpec("minimax-cn");
const GLOBAL = accountSpec("minimax-global");
const GO = accountSpec("opencode-go");
const GLM = accountSpec("glm");

describe("normalizeRemainsPayload", () => {
  it("reads percent-mode model_remains", () => {
    const account = normalizeRemainsPayload(
      {
        current_subscribe_title: "Plus",
        model_remains: [
          {
            model_name: "general",
            current_interval_remaining_percent: 99,
            current_weekly_remaining_percent: 100,
            remains_time: 3_600_000,
            weekly_remains_time: 86_400_000,
          },
        ],
        base_resp: { status_code: 0, status_msg: "success" },
      },
      CN,
      NOW,
    );
    expect(account.ok).toBe(true);
    expect(account.id).toBe("minimax-cn");
    expect(account.planName).toBe("Plus");
    const entry = account.entries[0];
    expect(entry).toMatchObject({ name: "general", included: true });
    expect(entry?.windows[0]).toMatchObject({
      key: "interval",
      label: "5h",
      remainingPercent: 99,
      endAt: NOW + 3_600_000,
    });
    expect(entry?.windows[1]).toMatchObject({
      key: "weekly",
      label: "7d",
      remainingPercent: 100,
      endAt: NOW + 86_400_000,
    });
  });

  it("treats legacy usage_count as remaining quota", () => {
    const account = normalizeRemainsPayload(
      {
        model_remains: [
          {
            model_name: "general",
            current_interval_total_count: 100,
            current_interval_usage_count: 80,
            current_weekly_total_count: 500,
            current_weekly_usage_count: 400,
          },
        ],
        base_resp: { status_code: 0, status_msg: "success" },
      },
      GLOBAL,
      NOW,
    );
    expect(account.ok).toBe(true);
    expect(account.entries[0]?.windows[0]?.remainingPercent).toBe(80);
    expect(account.entries[0]?.windows[1]?.remainingPercent).toBe(80);
  });

  it("prefers remaining_count aliases over usage_count", () => {
    const account = normalizeRemainsPayload(
      {
        model_remains: [
          {
            model_name: "general",
            current_interval_total_count: 100,
            current_interval_usage_count: 80,
            current_interval_remaining_count: 25,
          },
        ],
        base_resp: { status_code: 0, status_msg: "success" },
      },
      GLOBAL,
      NOW,
    );
    expect(account.entries[0]?.windows[0]?.remainingPercent).toBe(25);
  });

  it("marks quota 0 models as not included", () => {
    const account = normalizeRemainsPayload(
      {
        model_remains: [
          {
            model_name: "video",
            current_interval_quota: 0,
            current_weekly_quota: 0,
            current_interval_remaining_percent: 0,
          },
        ],
        base_resp: { status_code: 0, status_msg: "success" },
      },
      CN,
      NOW,
    );
    expect(account.entries[0]?.included).toBe(false);
  });

  it("uses end_time when present", () => {
    const account = normalizeRemainsPayload(
      {
        model_remains: [
          {
            model_name: "general",
            current_interval_remaining_percent: 50,
            end_time: NOW + 120_000,
          },
        ],
        base_resp: { status_code: 0, status_msg: "success" },
      },
      GLOBAL,
      NOW,
    );
    expect(account.entries[0]?.windows[0]?.endAt).toBe(NOW + 120_000);
  });

  it("fails on non-zero base_resp", () => {
    const account = normalizeRemainsPayload(
      {
        model_remains: [{ model_name: "general" }],
        base_resp: { status_code: 2013, status_msg: "invalid params" },
      },
      CN,
    );
    expect(account.ok).toBe(false);
    expect(account.error).toBe("invalid params");
  });

  it("maps cookie / 1004 auth errors to subscription-key hint", () => {
    const account = normalizeRemainsPayload(
      { base_resp: { status_code: 1004, status_msg: "cookie is missing, log in again" } },
      CN,
    );
    expect(account.ok).toBe(false);
    expect(account.error).toMatch(/订阅 Key/);
  });

  it("fails on empty model_remains", () => {
    const account = normalizeRemainsPayload(
      { model_remains: [], base_resp: { status_code: 0, status_msg: "success" } },
      GLOBAL,
    );
    expect(account.ok).toBe(false);
    expect(account.error).toBe("无模型配额数据");
  });

  it("ignores unknown extra fields", () => {
    const account = normalizeRemainsPayload(
      {
        extra_future_field: { nested: true },
        model_remains: [
          {
            model_name: "general",
            current_interval_remaining_percent: 12,
            brand_new_counter: 9,
          },
        ],
        base_resp: { status_code: 0, status_msg: "success" },
      },
      GLOBAL,
      NOW,
    );
    expect(account.ok).toBe(true);
    expect(account.entries[0]?.windows[0]?.remainingPercent).toBe(12);
  });
});

describe("normalizeOpenCodeGoPayload", () => {
  it("maps the three account windows and reports the remaining share", () => {
    const account = normalizeOpenCodeGoPayload(
      {
        usage: {
          rolling: { status: "ok", percent: 0, resetsAt: "2026-11-15T07:59:36.278Z" },
          weekly: { status: "ok", percent: 46, resetsAt: "2026-11-16T00:00:00.000Z" },
          monthly: { status: "ok", percent: 53, resetsAt: "2026-11-26T02:10:54.000Z" },
        },
      },
      GO,
    );
    expect(account.ok).toBe(true);
    expect(account.id).toBe("opencode-go");
    const windows = account.entries[0]?.windows ?? [];
    expect(windows.map((item) => item.key)).toEqual(["interval", "weekly", "monthly"]);
    expect(windows[0]?.remainingPercent).toBe(100);
    expect(windows[1]?.remainingPercent).toBe(54);
    expect(windows[2]?.remainingPercent).toBe(47);
    expect(windows[1]?.endAt).toBe(Date.parse("2026-11-16T00:00:00.000Z"));
  });

  it("accepts the flat shape without the usage wrapper", () => {
    const account = normalizeOpenCodeGoPayload({ monthly: { percent: 20 } }, GO);
    expect(account.ok).toBe(true);
    expect(account.entries[0]?.windows[0]?.key).toBe("monthly");
  });

  it("fails on an unexpected payload", () => {
    const account = normalizeOpenCodeGoPayload({ hello: "world" }, GO);
    expect(account.ok).toBe(false);
    expect(account.error).toMatch(/结构不符合预期/);
  });
});

describe("normalizeGlmQuotaPayload", () => {
  const payload = {
    code: 200,
    msg: "Operation successful",
    success: true,
    data: {
      level: "pro",
      limits: [
        {
          type: "TOKENS_LIMIT",
          unit: 3,
          number: 5,
          usage: 800_000_000,
          currentValue: 127_694_464,
          remaining: 672_305_536,
          percentage: 15,
          nextResetTime: 1770648402389,
        },
        { type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 53, nextResetTime: 1772272043542 },
        {
          type: "TIME_LIMIT",
          unit: 5,
          number: 1,
          usage: 4000,
          currentValue: 1828,
          remaining: 2172,
          percentage: 45,
          nextResetTime: 1773596236982,
        },
      ],
    },
  };

  it("maps the limits by unit, never by array position", () => {
    const account = normalizeGlmQuotaPayload(payload, GLM);
    expect(account.ok).toBe(true);
    expect(account.planName).toBe("GLM Coding Plan · Pro");
    const windows = account.entries[0]?.windows ?? [];
    expect(windows.map((item) => item.key)).toEqual(["interval", "weekly", "monthly"]);
    expect(windows[0]?.remainingPercent).toBe(85);
    expect(windows[1]?.remainingPercent).toBe(47);
    expect(windows[2]?.remainingPercent).toBe(55);
    expect(windows[0]?.endAt).toBe(1770648402389);
  });

  it("computes the used share when the server omits percentage", () => {
    const account = normalizeGlmQuotaPayload(
      {
        success: true,
        data: {
          limits: [{ type: "TOKENS_LIMIT", unit: 3, usage: 200, currentValue: 50 }],
        },
      },
      GLM,
    );
    expect(account.entries[0]?.windows[0]?.remainingPercent).toBe(75);
  });

  it("reports a missing subscription", () => {
    const account = normalizeGlmQuotaPayload({ code: 200, success: false, msg: "no plan" }, GLM);
    expect(account.ok).toBe(false);
    expect(account.error).toMatch(/订阅/);
  });

  it("fails when no limit carries a usable window", () => {
    const account = normalizeGlmQuotaPayload({ success: true, data: { limits: [] } }, GLM);
    expect(account.ok).toBe(false);
    expect(account.error).toBe("无可用配额数据");
  });
});

describe("mapHttpError", () => {
  it("maps 401/403 to the subscription-key hint", () => {
    expect(mapHttpError(401, {}, CN)).toMatch(/订阅 Key/);
    expect(mapHttpError(403, { base_resp: { status_msg: "unauthorized" } }, CN)).toMatch(/订阅 Key/);
  });

  it("uses the account-specific wording for other vendors", () => {
    expect(mapHttpError(401, {}, GO)).toMatch(/OpenCode Go/);
    expect(mapHttpError(403, {}, GLM)).toMatch(/GLM/);
  });

  it("keeps generic HTTP errors", () => {
    expect(mapHttpError(500, {}, CN)).toBe("查询失败 (HTTP 500)");
  });
});
