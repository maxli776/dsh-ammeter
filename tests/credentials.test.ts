import { describe, expect, it } from "vitest";
import { configuredAccounts, resolveKeys } from "../src/credentials.js";
import type { CredentialsLike } from "../src/types.js";

describe("resolveKeys", () => {
  it("returns nothing when no source is configured", async () => {
    const keys = await resolveKeys(undefined, {});
    expect(keys).toEqual({});
    expect(configuredAccounts(keys)).toEqual([]);
  });

  it("reads only the global MiniMax env key", async () => {
    const keys = await resolveKeys(undefined, { MINIMAX_API_KEY: "sk-global" });
    expect(keys).toEqual({ "minimax-global": "sk-global" });
    expect(configuredAccounts(keys)).toEqual(["minimax-global"]);
  });

  it("reads only the CN MiniMax env key", async () => {
    const keys = await resolveKeys(undefined, { MINIMAX_CN_API_KEY: "sk-cn" });
    expect(keys).toEqual({ "minimax-cn": "sk-cn" });
    expect(configuredAccounts(keys)).toEqual(["minimax-cn"]);
  });

  it("reads the OpenCode Go key", async () => {
    const keys = await resolveKeys(undefined, { OPENCODE_GO_API_KEY: "sk-go" });
    expect(keys).toEqual({ "opencode-go": "sk-go" });
    expect(configuredAccounts(keys)).toEqual(["opencode-go"]);
  });

  it("accepts the generic OpenCode key as a fallback", async () => {
    const keys = await resolveKeys(undefined, { OPENCODE_API_KEY: "sk-opencode" });
    expect(keys["opencode-go"]).toBe("sk-opencode");
  });

  it("reads a GLM key under any of the known names", async () => {
    expect((await resolveKeys(undefined, { GLM_API_KEY: "a" }))["glm"]).toBe("a");
    expect((await resolveKeys(undefined, { ZAI_API_KEY: "b" }))["glm"]).toBe("b");
    expect((await resolveKeys(undefined, { Z_AI_API_KEY: "c" }))["glm"]).toBe("c");
  });

  it("reads every configured account at once", async () => {
    const keys = await resolveKeys(undefined, {
      MINIMAX_API_KEY: "sk-global",
      MINIMAX_CN_API_KEY: "sk-cn",
      OPENCODE_GO_API_KEY: "sk-go",
      GLM_API_KEY: "sk-glm",
    });
    expect(configuredAccounts(keys)).toEqual([
      "minimax-global",
      "minimax-cn",
      "opencode-go",
      "glm",
    ]);
  });

  it("prefers the credentials seam over process env", async () => {
    const credentials: CredentialsLike = {
      async resolve(ref) {
        if (ref === "MINIMAX_API_KEY") return { value: "from-seam" };
        return undefined;
      },
    };
    const keys = await resolveKeys(credentials, { MINIMAX_API_KEY: "from-env" });
    expect(keys["minimax-global"]).toBe("from-seam");
  });

  it("falls back to env when the seam has no value", async () => {
    const credentials: CredentialsLike = {
      async resolve() {
        return undefined;
      },
    };
    const keys = await resolveKeys(credentials, { MINIMAX_CN_API_KEY: "from-env" });
    expect(keys["minimax-cn"]).toBe("from-env");
  });

  it("treats empty stored values as absent", async () => {
    const credentials: CredentialsLike = {
      async resolve() {
        return { value: "" };
      },
    };
    const keys = await resolveKeys(credentials, {});
    expect(keys).toEqual({});
  });
});
