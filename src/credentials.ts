import { ACCOUNTS, type AccountSpec } from "./accounts.js";
import type { AccountId, CredentialsLike } from "./types.js";

/** Resolved key per account. Absent means "not configured". */
export type ResolvedKeys = Partial<Record<AccountId, string>>;

export async function resolveKeys(
  credentials: CredentialsLike | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedKeys> {
  const resolved = await Promise.all(
    ACCOUNTS.map(async (spec) => [spec.id, await resolveAccountKey(credentials, env, spec)] as const),
  );
  const out: ResolvedKeys = {};
  for (const [id, value] of resolved) {
    if (value !== undefined) out[id] = value;
  }
  return out;
}

/** The accounts that have a key, in registry order. */
export function configuredAccounts(keys: ResolvedKeys): AccountId[] {
  return ACCOUNTS.filter((spec) => keys[spec.id] !== undefined).map((spec) => spec.id);
}

async function resolveAccountKey(
  credentials: CredentialsLike | undefined,
  env: NodeJS.ProcessEnv,
  spec: AccountSpec,
): Promise<string | undefined> {
  for (const ref of spec.credentialRefs) {
    const value = await resolveOne(credentials, env, ref);
    if (value !== undefined) return value;
  }
  return undefined;
}

async function resolveOne(
  credentials: CredentialsLike | undefined,
  env: NodeJS.ProcessEnv,
  name: string,
): Promise<string | undefined> {
  if (credentials !== undefined) {
    try {
      const hit = await credentials.resolve(name);
      const value = hit?.value;
      if (typeof value === "string" && value.length > 0) return value;
    } catch {
      // Fall through to the process environment.
    }
  }
  const ambient = env[name];
  if (typeof ambient === "string" && ambient.length > 0) return ambient;
  return undefined;
}
