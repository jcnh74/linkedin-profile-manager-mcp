/**
 * Local config. Loaded from (first found):
 *   1. $LINKEDIN_MCP_CONFIG (explicit path)
 *   2. ./linkedin-mcp.config.json (cwd)
 *   3. ~/.linkedin-profile-manager/config.json
 *
 * SECURITY: config never contains LinkedIn passwords or li_at cookies.
 * The only credential-adjacent value permitted is an OAuth access token
 * for the OFFICIAL LinkedIn API (posting), preferably supplied via the
 * LINKEDIN_ACCESS_TOKEN env var rather than the file.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

export const ConfigSchema = z.object({
  /** Directory for profile snapshots + exported patches. */
  dataDir: z
    .string()
    .default(path.join(os.homedir(), ".linkedin-profile-manager")),
  /** Explicit opt-in for read-only browser extraction helper text. Default off. */
  allowReadOnlyBrowserExtraction: z.boolean().default(false),
  /** Official API posting is only enabled when OAuth is configured AND this is true. */
  enableOfficialPosting: z.boolean().default(false),
  /** Your public profile slug (linkedin.com/in/<slug>) for building edit URLs. */
  profileSlug: z.string().optional(),
});
export type Config = z.infer<typeof ConfigSchema>;

const FORBIDDEN_KEYS = ["password", "li_at", "cookie", "cookies", "sessionCookie", "csrf"];

export function loadConfig(): Config {
  const candidates = [
    process.env.LINKEDIN_MCP_CONFIG,
    path.join(process.cwd(), "linkedin-mcp.config.json"),
    path.join(os.homedir(), ".linkedin-profile-manager", "config.json"),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      for (const k of Object.keys(raw)) {
        if (FORBIDDEN_KEYS.includes(k)) {
          throw new Error(
            `Refusing to load config: forbidden credential key "${k}" found in ${p}. ` +
              `This server never stores LinkedIn credentials or session cookies.`
          );
        }
      }
      return ConfigSchema.parse(raw);
    }
  }
  return ConfigSchema.parse({});
}

/** OAuth token for the OFFICIAL LinkedIn API only. Env var only — never persisted. */
export function getOfficialAccessToken(): string | undefined {
  return process.env.LINKEDIN_ACCESS_TOKEN || undefined;
}
