/**
 * get_profile_snapshot — ingest the current profile from user-provided data.
 * Sources: pasted text, text extracted from LinkedIn's "Save to PDF" export,
 * or structured JSON. No scraping. If the user has NOT provided data yet,
 * we return instructions for how to export it manually.
 */
import { z } from "zod";
import { Profile, ProfileSchema } from "../types.js";
import { LocalProfileStore, parseProfileText } from "../storage/localProfileStore.js";
import { Config } from "../config.js";

export const GetProfileSnapshotInput = z.object({
  source: z
    .enum(["pasted_text", "pdf_text", "json", "load_saved"])
    .describe(
      "pasted_text: raw copy/paste from your profile page. pdf_text: text extracted from LinkedIn's 'Save to PDF'. json: structured Profile JSON. load_saved: reload the last saved snapshot."
    ),
  text: z.string().optional().describe("Profile text (for pasted_text / pdf_text)"),
  json: ProfileSchema.partial().optional().describe("Structured profile (for json source)"),
});
export type GetProfileSnapshotArgs = z.infer<typeof GetProfileSnapshotInput>;

export const MANUAL_EXPORT_INSTRUCTIONS = `To capture your profile without any automation:
1. Open https://www.linkedin.com/in/me/
2. Click "Resources" (or "More") → "Save to PDF", OR select-all + copy the page text.
3. Call get_profile_snapshot with source=pasted_text (or pdf_text) and the text.
Alternatively request your full data export: Settings & Privacy → Data privacy → Get a copy of your data.`;

export function runGetProfileSnapshot(
  args: GetProfileSnapshotArgs,
  store: LocalProfileStore,
  config: Config
): { profile: Profile | null; savedTo?: string; message: string } {
  if (args.source === "load_saved") {
    const saved = store.loadSnapshot();
    return saved
      ? { profile: saved, message: "Loaded saved snapshot." }
      : { profile: null, message: `No saved snapshot found.\n\n${MANUAL_EXPORT_INSTRUCTIONS}` };
  }

  let profile: Profile;
  if (args.source === "json") {
    if (!args.json) throw new Error("source=json requires the `json` field.");
    profile = ProfileSchema.parse(args.json);
  } else {
    if (!args.text || args.text.trim().length < 20) {
      throw new Error(`Provide profile text (>=20 chars).\n\n${MANUAL_EXPORT_INSTRUCTIONS}`);
    }
    profile = parseProfileText(args.text);
  }

  if (config.profileSlug && !profile.customUrl) {
    profile.customUrl = `linkedin.com/in/${config.profileSlug}`;
  }

  const savedTo = store.saveSnapshot(profile);
  return {
    profile,
    savedTo,
    message: `Snapshot parsed and saved locally (${savedTo}). Review parsed fields; if parsing missed sections, re-submit as structured JSON.`,
  };
}
