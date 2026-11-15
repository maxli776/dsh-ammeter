/**
 * Shared shapes for every subscription account the plugin tracks.
 *
 * The plugin used to model one vendor: MiniMax, split into two "regions".
 * It now tracks several vendors at once (MiniMax, OpenCode Go, GLM), so the
 * unit of work is an *account* — one plan of one vendor — and every account
 * reports its quota as a list of *windows* (5h / weekly / monthly), whatever
 * the vendor happens to call them.
 */

/** One tracked subscription account. */
export type AccountId = "minimax-global" | "minimax-cn" | "opencode-go" | "glm";

/** The quota windows this plugin knows how to render. */
export type WindowKey = "interval" | "weekly" | "monthly";

/** One quota window of an account (or of one of its model rows). */
export interface UsageWindow {
  /** Stable key of the window. */
  key: WindowKey;
  /** Short label for the compact bar, e.g. "5h" / "7d" / "月". */
  label: string;
  /** Full label for the tooltip, e.g. "5 小时窗口". */
  title: string;
  /** Remaining quota in percent (0-100). */
  remainingPercent?: number;
  /** Absolute reset moment (epoch ms). */
  endAt?: number;
}

/**
 * One row of an account: a model row (MiniMax reports per model) or the
 * account-level allowance (OpenCode Go and GLM report one budget each).
 */
export interface UsageEntry {
  name: string;
  /** False when the row is not part of the plan. */
  included: boolean;
  windows: UsageWindow[];
}

/** One configured (or attempted) subscription account. */
export interface AccountSnapshot {
  id: AccountId;
  /** Human label, e.g. "MiniMax 国内站". */
  label: string;
  configured: boolean;
  ok: boolean;
  stale?: boolean;
  error?: string;
  planName?: string;
  entries: UsageEntry[];
}

export type RefreshReason =
  | "startup"
  | "turn-idle"
  | "heartbeat"
  | "credential"
  | "manual"
  | "interval-reset"
  | "running";

/** Browser-facing usage payload. Never contains secrets or Host objects. */
export interface UsageSnapshot {
  fetchedAt: number | null;
  error?: string;
  reason?: RefreshReason;
  heartbeatMs?: number;
  /**
   * "init" while the plugin is still warming credentials after start; the
   * client renders a loading state instead of treating the empty accounts
   * list as an unconfigured error. Absent (or "ready") means the snapshot
   * reflects a real fetch.
   */
  phase?: "init" | "ready";
  accounts: AccountSnapshot[];
}

/** Structural face of `ctx.credentials` used by this plugin. */
export interface CredentialsLike {
  resolve(ref: string): Promise<{ value?: string } | undefined>;
}

export const CACHE_TTL_MS = 45_000;
export const FETCH_TIMEOUT_MS = 8_000;
