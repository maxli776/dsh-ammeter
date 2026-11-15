/**
 * The registry of subscription accounts this plugin knows how to query.
 *
 * Everything vendor-specific lives here: which DSH provider id selects the
 * account, which credential refs hold its key, which usage endpoint answers,
 * and how a rejection should be worded. The rest of the plugin works on
 * {@link AccountId} alone.
 */

import type { AccountId } from "./types.js";

export interface AccountSpec {
  id: AccountId;
  /** Human label shown in the tooltip. */
  label: string;
  /** Short label for the compact strip, e.g. "国内站". */
  shortLabel: string;
  /** DSH provider ids that select this account. */
  providers: readonly string[];
  /** Credential refs holding the key, in priority order. */
  credentialRefs: readonly string[];
  /** Usage endpoints, in fallback order. */
  urls: readonly string[];
  /** Message shown when the key itself is rejected (HTTP 401). */
  invalidKeyMessage: string;
  /** Message shown when the key is valid but the plan is missing (HTTP 403). */
  noPlanMessage: string;
  /**
   * Try the next endpoint even after an auth rejection. Only useful where the
   * endpoints are different regional products of the same vendor (GLM's
   * global coding plan and its BigModel/China counterpart).
   */
  fallbackOnAuth?: boolean;
  /** Refuse redirects, so the key is never handed to another host. */
  noRedirect?: boolean;
}

const MINIMAX_AUTH_HINT =
  "Key 无效或不是订阅 Key。Token Plan 用量查询必须使用订阅 Key，不能使用普通按量付费 API Key。";

export const ACCOUNTS: readonly AccountSpec[] = [
  {
    id: "minimax-global",
    label: "MiniMax Token Plan · 国际站",
    shortLabel: "国际站",
    providers: ["minimax"],
    credentialRefs: ["MINIMAX_API_KEY"],
    urls: [
      "https://www.minimax.io/v1/token_plan/remains",
      "https://api.minimax.io/v1/token_plan/remains",
    ],
    invalidKeyMessage: MINIMAX_AUTH_HINT,
    noPlanMessage: MINIMAX_AUTH_HINT,
  },
  {
    id: "minimax-cn",
    label: "MiniMax Token Plan · 国内站",
    shortLabel: "国内站",
    providers: ["minimax-cn"],
    credentialRefs: ["MINIMAX_CN_API_KEY"],
    urls: [
      "https://api.minimaxi.com/v1/token_plan/remains",
      "https://www.minimaxi.com/v1/token_plan/remains",
    ],
    invalidKeyMessage: MINIMAX_AUTH_HINT,
    noPlanMessage: MINIMAX_AUTH_HINT,
  },
  {
    id: "opencode-go",
    label: "OpenCode Go",
    shortLabel: "OpenCode Go",
    providers: ["opencode-go"],
    credentialRefs: ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"],
    urls: ["https://opencode.ai/zen/go/v1/usage"],
    invalidKeyMessage: "OpenCode Go API Key 无效或已失效（HTTP 401）。",
    noPlanMessage: "该 Key 没有 OpenCode Go 订阅（HTTP 403）。",
    noRedirect: true,
  },
  {
    id: "glm",
    label: "GLM 编程套餐",
    shortLabel: "GLM",
    providers: [
      "zai",
      "zai-coding-plan",
      "zai-coding-cn",
      "glm",
      "glm-cn",
      "zhipu",
      "bigmodel",
    ],
    credentialRefs: ["GLM_API_KEY", "ZAI_API_KEY", "Z_AI_API_KEY"],
    urls: [
      "https://api.z.ai/api/monitor/usage/quota/limit",
      "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
    ],
    invalidKeyMessage: "GLM API Key 无效或已失效（HTTP 401）。",
    noPlanMessage: "该 Key 没有 GLM 编程套餐订阅（HTTP 403）。",
    fallbackOnAuth: true,
  },
];

const BY_ID = new Map<AccountId, AccountSpec>(ACCOUNTS.map((spec) => [spec.id, spec]));

export function accountSpec(id: AccountId): AccountSpec {
  const spec = BY_ID.get(id);
  if (spec === undefined) throw new Error(`unknown account: ${id}`);
  return spec;
}

/** The account a DSH provider id belongs to, if any. */
export function accountOfProvider(provider: unknown): AccountId | undefined {
  if (typeof provider !== "string" || provider.length === 0) return undefined;
  for (const spec of ACCOUNTS) {
    if (spec.providers.includes(provider)) return spec.id;
  }
  return undefined;
}

/** The account a credential ref belongs to, if any. */
export function accountOfCredentialRef(ref: unknown): AccountId | undefined {
  if (typeof ref !== "string" || ref.length === 0) return undefined;
  for (const spec of ACCOUNTS) {
    if (spec.credentialRefs.includes(ref)) return spec.id;
  }
  return undefined;
}

/** Every credential ref the plugin watches, without duplicates. */
export const CREDENTIAL_REFS: readonly string[] = [
  ...new Set(ACCOUNTS.flatMap((spec) => [...spec.credentialRefs])),
];
