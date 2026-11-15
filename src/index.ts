/**
 * dsh-ammeter — subscription usage in the DSH Web UI.
 *
 * Tracks the quota of every subscription this install has a key for (MiniMax
 * Token Plan, OpenCode Go, GLM coding plan) and shows the one that belongs to
 * the currently selected provider.
 *
 * Cordis host plugin entry. Loaded through the package's cordis.patch.yml
 * bundle layer. Zero runtime dependencies on `@deepseek-ai/*`: DSH services
 * are read through `ctx.get(...)` / `ctx.inject(...)`.
 */

import { accountOfCredentialRef, accountOfProvider } from "./accounts.js";
import type { UsageSnapshot } from "./types.js";
import { RefreshScheduler } from "./refresh.js";
import { UsageService } from "./service.js";

export const name = "dsh-ammeter";
export const inject: string[] = [];

/**
 * Browser-facing route prefix. `src/client.js` is served as a standalone
 * module bundle and cannot import this constant, so it carries the same
 * literal — keep the two in sync.
 */
export const API_BASE = "/dsh-ammeter/api";

export function apply(ctx: unknown): () => void {
  const context = ctx as {
    get<T = unknown>(name: string): T | undefined;
    on?(event: string, listener: (...args: unknown[]) => unknown): () => void;
    inject?: (deps: string[], callback: (ctx: unknown) => unknown) => unknown;
  };
  const service = new UsageService(context);
  const scheduler = new RefreshScheduler({
    snapshot: (force, reason) => {
      service.heartbeatMs = scheduler.heartbeatMs;
      return service.snapshot(force, reason);
    },
  });

  // Resolve the first usable snapshot before any /status request lands so the
  // Web UI never flashes the "unconfigured" error during the brief window in
  // which `dsh-credentials-local` is still loading `.credentials.yaml`.
  // Runs concurrently with the event subscriptions and route registration
  // below; the .catch guarantees the service can never get stuck in "init".
  void service.prewarm().catch(() => {
    service.markReady();
  });

  if (typeof context.on === "function") {
    context.on("llm/stream", (options, next) => {
      const optionsObject =
        options !== null && typeof options === "object"
          ? (options as { provider?: unknown; sessionId?: unknown; purpose?: unknown })
          : undefined;
      const provider = optionsObject?.provider;
      const sessionId =
        typeof optionsObject?.sessionId === "string" ? optionsObject.sessionId : undefined;
      const account = accountOfProvider(provider);
      const auxiliary =
        optionsObject?.purpose === "compaction" || optionsObject?.purpose === "session-title";
      if (auxiliary) {
        if (account !== undefined) scheduler.markDirty(account);
      } else {
        scheduler.observeProvider(account, sessionId);
      }
      const nxt = next as () => unknown;
      return nxt();
    });
    context.on("agent/status", (payload) => {
      const payloadObject =
        payload !== null && typeof payload === "object"
          ? (payload as { status?: unknown; agent?: { id?: unknown } })
          : undefined;
      const status = payloadObject?.status;
      const agentId = typeof payloadObject?.agent?.id === "string" ? payloadObject.agent.id : undefined;
      if (status === "running") scheduler.onRunning(agentId);
      else if (status === "idle") scheduler.onIdle(agentId);
    });
    context.on("credentials/reference-updated", (ref) => {
      if (accountOfCredentialRef(ref) === undefined) return;
      void scheduler.refreshNow("credential");
    });
  }

  if (typeof context.inject === "function") {
    context.inject(["webServer"], (httpCtx) => {
      const webServer = (httpCtx as {
        get<T = unknown>(name: string): T | undefined;
      }).get<{
        register(route: {
          kind: "exact" | "prefix";
          path: string;
          handler: (req: unknown, res: unknown) => void;
        }): unknown;
      }>("webServer");
      if (!webServer) {
        console.warn("[dsh-ammeter] webServer unavailable; Web UI disabled");
        return;
      }

      webServer.register({
        kind: "exact",
        path: `${API_BASE}/status`,
        handler: (req, res) => {
          void handleStatus(req, res, service, scheduler, false);
        },
      });
      webServer.register({
        kind: "exact",
        path: `${API_BASE}/refresh`,
        handler: (req, res) => {
          void handleStatus(req, res, service, scheduler, true);
        },
      });
      console.log("[dsh-ammeter] floating usage bubble available on the Web UI");
    });
  } else {
    console.warn("[dsh-ammeter] ctx.inject unavailable; Web UI disabled");
  }

  return () => {
    scheduler.dispose();
    service.dispose();
  };
}

async function handleStatus(
  req: unknown,
  res: unknown,
  service: UsageService,
  scheduler: RefreshScheduler,
  force: boolean,
): Promise<void> {
  const method = String((req as { method?: string }).method ?? "GET").toUpperCase();
  if (force && method !== "POST" && method !== "GET") {
    sendJson(res, 405, { error: "method not allowed" });
    return;
  }
  try {
    if (force) await scheduler.refreshNow("manual");
    service.heartbeatMs = scheduler.heartbeatMs;
    const snapshot: UsageSnapshot = await service.snapshot(false, force ? "manual" : "startup");
    sendJson(res, 200, snapshot);
  } catch (err) {
    sendJson(res, 500, {
      fetchedAt: null,
      error: err instanceof Error ? err.message : String(err),
      accounts: [],
    } satisfies UsageSnapshot);
  }
}

interface HttpResponse {
  statusCode?: number;
  setHeader(name: string, value: string): void;
  end(chunk: string): void;
}

function sendJson(res: unknown, status: number, body: unknown): void {
  const response = res as HttpResponse;
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}
