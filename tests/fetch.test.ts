import { describe, expect, it } from "vitest";
import { accountSpec } from "../src/accounts.js";
import { describeFetchError, fetchAccountUsage } from "../src/fetch.js";

const CN = accountSpec("minimax-cn");
const GO = accountSpec("opencode-go");
const GLM = accountSpec("glm");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchAccountUsage", () => {
  it("falls back to the next host when the first request cannot connect", async () => {
    const seen: string[] = [];
    const payload = {
      model_remains: [{ model_name: "general", current_interval_remaining_percent: 42 }],
      base_resp: { status_code: 0, status_msg: "success" },
    };
    const body = await fetchAccountUsage(CN, "sk-test", async (url) => {
      seen.push(url);
      if (url.includes("api.minimaxi.com")) {
        throw Object.assign(new Error("fetch failed"), { cause: new Error("unable to get local issuer certificate") });
      }
      return jsonResponse(payload);
    });
    expect(seen[0]).toContain("api.minimaxi.com");
    expect(seen[1]).toContain("www.minimaxi.com");
    expect(body).toEqual(payload);
  });

  it("does not fall back on an auth failure", async () => {
    const seen: string[] = [];
    await expect(
      fetchAccountUsage(CN, "sk-test", async (url) => {
        seen.push(url);
        return jsonResponse({ base_resp: { status_code: 1004, status_msg: "unauthorized" } }, 401);
      }),
    ).rejects.toThrow(/订阅 Key/);
    expect(seen).toHaveLength(1);
  });

  it("tries the China mirror after the global GLM endpoint rejects the key", async () => {
    const seen: string[] = [];
    const body = await fetchAccountUsage(GLM, "sk-test", async (url) => {
      seen.push(url);
      if (url.includes("api.z.ai")) return jsonResponse({ success: false, msg: "no plan" }, 403);
      return jsonResponse({ success: true, data: { limits: [] } });
    });
    expect(seen[0]).toContain("api.z.ai");
    expect(seen[1]).toContain("open.bigmodel.cn");
    expect(body).toMatchObject({ success: true });
  });

  it("identifies the client and refuses redirects for OpenCode Go", async () => {
    let init: RequestInit | undefined;
    await fetchAccountUsage(GO, "sk-go", async (_url, requestInit) => {
      init = requestInit;
      return jsonResponse({ usage: { weekly: { percent: 10 } } });
    });
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.["User-Agent"]).toMatch(/dsh-ammeter/);
    expect(headers?.Authorization).toBe("Bearer sk-go");
    expect(init?.redirect).toBe("error");
  });
});

describe("describeFetchError", () => {
  it("rewrites a bare fetch failed error", () => {
    const err = Object.assign(new Error("fetch failed"), { cause: new Error("unable to get local issuer certificate") });
    expect(describeFetchError(err)).toMatch(/证书/);
  });

  it("names the account in network errors", () => {
    const err = Object.assign(new Error("fetch failed"), { cause: new Error("ECONNREFUSED") });
    expect(describeFetchError(err, "MiniMax Token Plan · 国内站")).toMatch(/MiniMax/);
  });
});
