/**
 * generate_update_plan — step-by-step MANUAL editing plan.
 * Each step: exact field, edit URL, old text, new text, rationale.
 * This is the human-in-the-loop artifact: nothing here touches LinkedIn.
 */
import { z } from "zod";
import { Profile, ProposedChange } from "../types.js";
import { editUrlFor } from "../linkedin/browserOpenOnly.js";

export const ProposedChangeInput = z.object({
  field: z
    .string()
    .describe("Exact LinkedIn field, e.g. 'Headline', 'About', 'Experience > Acme > Senior Engineer', 'Skills'"),
  newText: z.string(),
  rationale: z.string().default(""),
});

export const GenerateUpdatePlanInput = z.object({
  changes: z.array(ProposedChangeInput).min(1),
});

export interface UpdatePlanStep extends ProposedChange {
  step: number;
  instructions: string;
}

export interface UpdatePlan {
  title: string;
  createdAt: string;
  steps: UpdatePlanStep[];
  reminder: string;
}

function sectionFor(field: string): string {
  const f = field.toLowerCase();
  if (f.startsWith("headline")) return "headline";
  if (f.startsWith("about")) return "about";
  if (f.startsWith("experience")) return "experience";
  if (f.startsWith("skills")) return "skills";
  if (f.startsWith("featured")) return "featured";
  if (f.startsWith("education")) return "education";
  return "profile";
}

function oldTextFor(field: string, profile: Profile | null): string {
  if (!profile) return "(no snapshot loaded — capture one with get_profile_snapshot)";
  const f = field.toLowerCase();
  if (f.startsWith("headline")) return profile.headline || "(empty)";
  if (f.startsWith("about")) return profile.about || "(empty)";
  if (f.startsWith("skills")) return profile.skills.join(", ") || "(empty)";
  if (f.startsWith("experience")) {
    // "Experience > Company > Title" — try to find the matching entry
    const parts = field.split(">").map((s) => s.trim().toLowerCase());
    const match = profile.experience.find(
      (e) =>
        parts.includes(e.company.toLowerCase()) || parts.includes(e.title.toLowerCase())
    );
    if (match) return (match.bullets ?? []).map((b) => `• ${b}`).join("\n") || match.description || "(empty)";
  }
  return "(not captured in snapshot)";
}

export function runGenerateUpdatePlan(
  changes: Array<{ field: string; newText: string; rationale: string }>,
  profile: Profile | null
): UpdatePlan {
  const steps: UpdatePlanStep[] = changes.map((c, i) => {
    const section = sectionFor(c.field);
    const editUrl = editUrlFor(section);
    return {
      step: i + 1,
      field: c.field,
      editUrl,
      oldText: oldTextFor(c.field, profile),
      newText: c.newText,
      rationale: c.rationale,
      risk: "manual-edit",
      instructions: `Open ${editUrl} → locate "${c.field}" → replace the old text with the new text below → review → click Save yourself.`,
    };
  });

  return {
    title: `LinkedIn manual update plan (${steps.length} step${steps.length > 1 ? "s" : ""})`,
    createdAt: new Date().toISOString(),
    steps,
    reminder:
      "Apply these by hand. Consider spacing changes over a few days and toggling off 'Notify network' in Settings if you don't want update broadcasts.",
  };
}

/** Render a plan as human-friendly Markdown. */
export function planToMarkdown(plan: UpdatePlan): string {
  const lines = [`# ${plan.title}`, ``, `_Created: ${plan.createdAt}_`, ``];
  for (const s of plan.steps) {
    lines.push(
      `## Step ${s.step}: ${s.field}`,
      ``,
      `**Edit here:** ${s.editUrl}`,
      ``,
      `**Why:** ${s.rationale || "—"}`,
      ``,
      `**Old:**`,
      "```",
      s.oldText,
      "```",
      ``,
      `**New (copy/paste):**`,
      "```",
      s.newText,
      "```",
      ``
    );
  }
  lines.push(`> ${plan.reminder}`);
  return lines.join("\n");
}
