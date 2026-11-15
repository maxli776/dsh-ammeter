import type { AccountSpec } from "./accounts.js";
import type { AccountSnapshot, UsageEntry, UsageWindow, WindowKey } from "./types.js";

export function isAuthFailureMessage(message: string): boolean {
  return /cookie is missing|log in again|unauthorized|invalid api key|invalid token|status_code["\\s:]*1004|1004/i.test(
    message,
  );
}

export function mapHttpError(status: number, body: unknown, spec: AccountSpec): string {
  const msg = statusMessageOf(body);
  if (status === 401) return spec.invalidKeyMessage;
  if (status === 403) return spec.noPlanMessage;
  if (msg !== undefined && isAuthFailureMessage(msg)) return spec.invalidKeyMessage;
  if (msg !== undefined && msg.length > 0) return msg;
  return `查询失败 (HTTP ${status})`;
}

/** Normalize one vendor payload into the plugin's account shape. */
export function normalizeAccountPayload(
  payload: unknown,
  spec: AccountSpec,
  now = Date.now(),
): AccountSnapshot {
  switch (spec.id) {
    case "opencode-go":
      return normalizeOpenCodeGoPayload(payload, spec);
    case "glm":
      return normalizeGlmQuotaPayload(payload, spec);
    default:
      return normalizeRemainsPayload(payload, spec, now);
  }
}

/* -------------------------------------------------------------------------- */
/* MiniMax — GET /v1/token_plan/remains                                       */
/* -------------------------------------------------------------------------- */

/**
 * MiniMax answers with one row per model, each row carrying a 5h and a weekly
 * window. The rows become the account's entries.
 */
export function normalizeRemainsPayload(
  payload: unknown,
  spec: AccountSpec,
  now = Date.now(),
): AccountSnapshot {
  const root = asRecord(payload);
  if (root === undefined) {
    return fail(spec, "无法解析用量数据");
  }

  const base = asRecord(root.base_resp);
  const statusCode = asNumber(base?.status_code);
  const statusMsg = asString(base?.status_msg);
  if (statusCode !== undefined && statusCode !== 0) {
    const raw = statusMsg ?? `MiniMax 返回错误 (${statusCode})`;
    return fail(spec, isAuthFailureMessage(raw) || statusCode === 1004 ? spec.invalidKeyMessage : raw);
  }

  const rows = modelRowsOf(root);
  if (rows === undefined) {
    return fail(spec, "无模型配额数据");
  }

  const entries: UsageEntry[] = [];
  for (const row of rows) {
    const entry = normalizeModelRow(row, now);
    if (entry !== undefined) entries.push(entry);
  }
  if (entries.length === 0) {
    return fail(spec, "无模型配额数据");
  }

  return {
    id: spec.id,
    label: spec.label,
    configured: true,
    ok: true,
    planName: planNameOf(root, rows),
    entries,
  };
}

function normalizeModelRow(row: Record<string, unknown>, now: number): UsageEntry | undefined {
  const name = asString(row.model_name) ?? asString(row.name) ?? asString(row.model);
  if (name === undefined || name.length === 0) return undefined;

  const included = isIncluded(row);
  const intervalRemainingPercent = remainingPercent(row, "interval");
  const weeklyRemainingPercent = remainingPercent(row, "weekly");
  const remainsTimeMs = remainsMs(row, "interval");
  const weeklyRemainsTimeMs = remainsMs(row, "weekly");

  return {
    name,
    included,
    windows: [
      {
        key: "interval",
        label: "5h",
        title: "5 小时窗口",
        ...optionalNumber("remainingPercent", intervalRemainingPercent),
        ...optionalNumber("endAt", endAt(row, "interval", now, remainsTimeMs)),
      },
      {
        key: "weekly",
        label: "7d",
        title: "本周窗口",
        ...optionalNumber("remainingPercent", weeklyRemainingPercent),
        ...optionalNumber("endAt", endAt(row, "weekly", now, weeklyRemainsTimeMs)),
      },
    ],
  };
}

function remainingPercent(row: Record<string, unknown>, window: "interval" | "weekly"): number | undefined {
  const percent = pickNumber(row, [
    `current_${window}_remaining_percent`,
    `${window}_remaining_percent`,
    `current_${window}_remain_percent`,
  ]);
  if (percent !== undefined) return clamp(percent, 0, 100);

  const remaining = pickNumber(row, [
    `current_${window}_remaining_count`,
    `current_${window}_remains_count`,
    `${window}_remaining_count`,
    `${window}_remains_count`,
  ]);
  const total = pickNumber(row, [
    `current_${window}_total_count`,
    `${window}_total_count`,
  ]);
  if (remaining !== undefined && total !== undefined && total > 0) {
    return clamp((remaining / total) * 100, 0, 100);
  }

  // Legacy remains API: current_*_usage_count is remaining quota, not consumed.
  const usageAsRemaining = pickNumber(row, [`current_${window}_usage_count`, `${window}_usage_count`]);
  if (usageAsRemaining !== undefined && total !== undefined && total > 0) {
    return clamp((usageAsRemaining / total) * 100, 0, 100);
  }
  return undefined;
}

function remainsMs(row: Record<string, unknown>, window: "interval" | "weekly"): number | undefined {
  const keys =
    window === "interval"
      ? ["remains_time", "current_interval_remains_time", "interval_remains_time"]
      : ["weekly_remains_time", "current_weekly_remains_time"];
  const value = pickNumber(row, keys);
  if (value === undefined || value < 0) return undefined;
  return value;
}

function endAt(
  row: Record<string, unknown>,
  window: "interval" | "weekly",
  now: number,
  remainsTimeMs: number | undefined,
): number | undefined {
  const raw = pickNumber(row, [
    window === "interval" ? "end_time" : "weekly_end_time",
    `current_${window}_end_time`,
    `${window}_end_time`,
  ]);
  const normalized = normalizeEpochMs(raw);
  if (normalized !== undefined) return normalized;
  if (remainsTimeMs !== undefined) return now + remainsTimeMs;
  return undefined;
}

function isIncluded(row: Record<string, unknown>): boolean {
  const quotas = [
    row.current_interval_quota,
    row.current_weekly_quota,
    row.interval_quota,
    row.weekly_quota,
    row.quota,
  ]
    .map(asNumber)
    .filter((value): value is number => value !== undefined);
  if (quotas.length === 0) return true;
  return quotas.some((value) => value > 0);
}

function planNameOf(root: Record<string, unknown>, rows: Record<string, unknown>[]): string | undefined {
  const fromRoot =
    asString(root.current_subscribe_title) ??
    asString(root.plan_name) ??
    asString(root.subscribe_title) ??
    asString(root.plan);
  if (fromRoot !== undefined) return fromRoot;
  for (const row of rows) {
    const fromRow =
      asString(row.current_subscribe_title) ??
      asString(row.plan_name) ??
      asString(row.subscribe_title) ??
      asString(row.plan);
    if (fromRow !== undefined) return fromRow;
  }
  return undefined;
}

function modelRowsOf(root: Record<string, unknown>): Record<string, unknown>[] | undefined {
  const raw = root.model_remains ?? root.models ?? root.data;
  const list = asArray(raw);
  if (list === undefined) return undefined;
  const rows: Record<string, unknown>[] = [];
  for (const item of list) {
    const rec = asRecord(item);
    if (rec !== undefined) rows.push(rec);
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/* OpenCode Go — GET /zen/go/v1/usage                                          */
/* -------------------------------------------------------------------------- */

/**
 * OpenCode Go answers with three account-level windows: the rolling 5h
 * window, the weekly one and the monthly one. `percent` is the share of that
 * window already spent, so the plugin reports the remaining share.
 */
export function normalizeOpenCodeGoPayload(payload: unknown, spec: AccountSpec): AccountSnapshot {
  const root = asRecord(payload);
  if (root === undefined) return fail(spec, "无法解析用量数据");

  const usage = asRecord(root.usage) ?? root;
  const windows: UsageWindow[] = [];
  addOpenCodeWindow(windows, "interval", "5h", "5 小时窗口", firstRecord(usage, ["rolling", "fiveHour", "5h", "session"]));
  addOpenCodeWindow(windows, "weekly", "7d", "本周窗口", firstRecord(usage, ["weekly", "week"]));
  addOpenCodeWindow(windows, "monthly", "月", "本月窗口", firstRecord(usage, ["monthly", "month"]));

  if (windows.length === 0) return fail(spec, "用量接口返回结构不符合预期");

  return {
    id: spec.id,
    label: spec.label,
    configured: true,
    ok: true,
    entries: [{ name: "账户额度", included: true, windows }],
  };
}

function addOpenCodeWindow(
  windows: UsageWindow[],
  key: WindowKey,
  label: string,
  title: string,
  record: Record<string, unknown> | undefined,
): void {
  if (record === undefined) return;
  const remaining = asNumber(record.remainingPercent) ?? asNumber(record.remaining_percent);
  const used = asNumber(record.percent) ?? asNumber(record.usedPercent) ?? asNumber(record.used_percent);
  const remainingPercent =
    remaining !== undefined
      ? clamp(remaining, 0, 100)
      : used !== undefined
        ? clamp(100 - used, 0, 100)
        : undefined;
  const endAt = parseTimestamp(
    firstDefined(record.resetsAt, record.resets_at, record.resetAt, record.reset_at),
  );
  windows.push({
    key,
    label,
    title,
    ...optionalNumber("remainingPercent", remainingPercent),
    ...optionalNumber("endAt", endAt),
  });
}

/* -------------------------------------------------------------------------- */
/* GLM — GET /api/monitor/usage/quota/limit                                    */
/* -------------------------------------------------------------------------- */

/**
 * Z.ai answers with a list of limits whose `unit` names the window — never
 * the array position: unit 3 is the rolling 5h window, unit 6 the multi-day
 * window, and a TIME_LIMIT entry the monthly tool allowance. `percentage` is
 * the share already spent.
 */
export function normalizeGlmQuotaPayload(payload: unknown, spec: AccountSpec): AccountSnapshot {
  const root = asRecord(payload);
  if (root === undefined) return fail(spec, "无法解析用量数据");
  if (root.success === false) return fail(spec, spec.noPlanMessage);

  const data = asRecord(root.data);
  if (data === undefined) return fail(spec, "无法解析用量数据");
  const limits = asArray(data.limits);
  if (limits === undefined) return fail(spec, "无可用配额数据");

  const windows: UsageWindow[] = [];
  for (const item of limits) {
    const entry = asRecord(item);
    if (entry === undefined) continue;
    const type = (asString(entry.type) ?? "").toUpperCase();
    const unit = asNumber(entry.unit);
    const isTokenLimit = type === "TOKENS_LIMIT" || type === "CREDIT_LIMIT";
    if (isTokenLimit && unit === 3) {
      addGlmWindow(windows, "interval", "5h", "5 小时窗口", entry);
    } else if (isTokenLimit && unit === 6) {
      addGlmWindow(windows, "weekly", "7d", "多日窗口", entry);
    } else if (type === "TIME_LIMIT") {
      addGlmWindow(windows, "monthly", "月", "本月工具额度", entry);
    }
  }
  if (windows.length === 0) return fail(spec, "无可用配额数据");

  const level = asString(data.level);
  return {
    id: spec.id,
    label: spec.label,
    configured: true,
    ok: true,
    planName: level === undefined ? undefined : `GLM Coding Plan · ${capitalize(level)}`,
    entries: [{ name: "套餐额度", included: true, windows }],
  };
}

function addGlmWindow(
  windows: UsageWindow[],
  key: WindowKey,
  label: string,
  title: string,
  entry: Record<string, unknown>,
): void {
  let used = asNumber(entry.percentage);
  if (used === undefined) {
    const current = asNumber(entry.currentValue);
    const limit = asNumber(entry.usage);
    if (current !== undefined && limit !== undefined && limit > 0) used = (current / limit) * 100;
  }
  if (used !== undefined && (used < 0 || used > 100)) used = undefined;
  const remainingPercent = used === undefined ? undefined : clamp(100 - used, 0, 100);
  const endAt = parseTimestamp(firstDefined(entry.nextResetTime, entry.next_reset_time));

  const window: UsageWindow = {
    key,
    label,
    title,
    ...optionalNumber("remainingPercent", remainingPercent),
    ...optionalNumber("endAt", endAt),
  };
  const at = windows.findIndex((item) => item.key === key);
  if (at >= 0) windows[at] = window;
  else windows.push(window);
}

/* -------------------------------------------------------------------------- */
/* Shared helpers                                                              */
/* -------------------------------------------------------------------------- */

function fail(spec: AccountSpec, error: string): AccountSnapshot {
  return {
    id: spec.id,
    label: spec.label,
    configured: true,
    ok: false,
    error,
    entries: [],
  };
}

function statusMessageOf(body: unknown): string | undefined {
  const rec = asRecord(body);
  if (rec === undefined) return undefined;
  const base = asRecord(rec.base_resp);
  const error = asRecord(rec.error);
  return (
    asString(base?.status_msg) ??
    asString(rec.message) ??
    asString(rec.msg) ??
    asString(error?.message) ??
    asString(rec.error)
  );
}

function firstRecord(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const record = asRecord(source[key]);
    if (record !== undefined) return record;
  }
  return undefined;
}

/** First value that is neither undefined nor null. */
function firstDefined(...values: unknown[]): unknown {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/** Epoch ms, epoch seconds and ISO-8601 all end up as epoch ms. */
function parseTimestamp(value: unknown): number | undefined {
  const numeric = asNumber(value);
  if (numeric !== undefined) {
    if (numeric <= 0) return undefined;
    return numeric > 1e12 ? numeric : numeric * 1000;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeEpochMs(value: number | undefined): number | undefined {
  if (value === undefined || value <= 0) return undefined;
  if (value > 1e12) return value;
  if (value > 1e9) return value * 1000;
  return undefined;
}

function pickNumber(row: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = asNumber(row[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function optionalNumber<K extends string>(key: K, value: number | undefined): Partial<Record<K, number>> {
  return value === undefined ? {} : ({ [key]: value } as Partial<Record<K, number>>);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
