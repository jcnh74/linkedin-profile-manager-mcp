/**
 * export_profile_patch — save an update plan as local Markdown + JSON.
 * local-write only; never pushes anywhere.
 */
import { z } from "zod";
import { LocalProfileStore } from "../storage/localProfileStore.js";
import { UpdatePlan, planToMarkdown } from "./generateUpdatePlan.js";

export const ExportProfilePatchInput = z.object({
  name: z
    .string()
    .default("profile-patch")
    .describe("Base filename (no extension). Timestamp is appended automatically."),
});

export interface ExportResult {
  markdownPath: string;
  jsonPath: string;
}

export function runExportProfilePatch(
  plan: UpdatePlan,
  name: string,
  store: LocalProfileStore
): ExportResult {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base = `${name}-${stamp}`;
  const markdownPath = store.writeExport(`${base}.md`, planToMarkdown(plan));
  const jsonPath = store.writeExport(`${base}.json`, JSON.stringify(plan, null, 2));
  return { markdownPath, jsonPath };
}
