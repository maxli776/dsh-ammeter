import type { AccountSpec } from "./accounts.js";
import { FETCH_TIMEOUT_MS } from "./types.js";
import { mapHttpError } from "./normalize.js";

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * OpenCode asks every client to identify itself instead of sending a generic
 * HTTP-library user agent; the same header is harmless for the other vendors.
 */
export const USER_AGENT = "dsh-ammeter/1.0.0 (+DeepSeek Harness plugin)";

/** An HTTP-level rejection. Carries the status so the caller can decide to retry. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export async function fetchAccountUsage(
  spec: AccountSpec,
  apiKey: string,
  fetchImpl: FetchLike = fetch,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<unknown> {
  let lastError: Error | undefined;
  for (const url of spec.urls) {
    try {
      return await fetchOne(url, apiKey, fetchImpl, timeoutMs, spec);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (!isRetryableFetchError(lastError, spec)) throw lastError;
    }
  }
  throw lastError ?? new Error("查询失败");
}

async function fetchOne(
  url: string,
  apiKey: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  spec: AccountSpec,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      ...(spec.noRedirect ? { redirect: "error" as const } : {}),
      signal: controller.signal,
    });
    const text = await resp.text();
    let body: unknown = {};
    if (text.trim().length > 0) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        throw new HttpError(resp.status, "无法解析用量数据");
      }
    }
    if (!resp.ok) throw new HttpError(resp.status, mapHttpError(resp.status, body, spec));
    return body;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("查询超时");
    }
    if (!(err instanceof Error)) throw err;
    throw new Error(describeFetchError(err, spec.label));
  } finally {
    clearTimeout(timer);
  }
}

export function describeFetchError(err: Error, label = "用量服务"): string {
  const cause = causeMessage(err);
  const combined = [err.message, cause].filter((part) => part && part.length > 0).join(": ");
  if (/unable to verify|certificate|ssl|tls|UNABLE_TO_VERIFY|CERT_/i.test(combined)) {
    return `连接 ${label} 时证书校验失败，已尝试备用域名`;
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(combined)) {
    return `无法解析 ${label} 域名`;
  }
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|network|fetch failed/i.test(combined)) {
    return cause && cause !== err.message ? `无法连接 ${label}（${cause}）` : `无法连接 ${label}`;
  }
  return combined || "查询失败";
}

/**
 * A request may be retried on the next endpoint when it never reached the
 * server. Accounts whose endpoints are different regional products of the
 * same vendor (GLM) also retry after an auth rejection, because the key is
 * valid on exactly one of them.
 */
export function isRetryableFetchError(err: Error, spec?: AccountSpec): boolean {
  if (
    spec?.fallbackOnAuth === true &&
    err instanceof HttpError &&
    (err.status === 401 || err.status === 403)
  ) {
    return true;
  }
  return /无法连接|证书|域名|超时|fetch failed|ssl|tls|certificate|ENOTFOUND|ECONN|ETIMEDOUT|AbortError/i.test(
    `${err.name} ${err.message}`,
  );
}

function causeMessage(err: Error): string | undefined {
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) return cause.message;
  if (typeof cause === "string" && cause.length > 0) return cause;
  return undefined;
}
