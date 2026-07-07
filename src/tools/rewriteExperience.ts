/**
 * rewrite_experience — draft-only rewrite of job experience bullets.
 * Formula: strong verb + what + tech + measurable outcome.
 */
import { z } from "zod";
import { Experience, ExperienceSchema } from "../types.js";
import { WEAK_PHRASES } from "../keywords.js";

export const RewriteExperienceInput = z.object({
  experience: ExperienceSchema.describe("The role to rewrite (from your snapshot or pasted fresh)."),
  targetKeywords: z.array(z.string()).default([]).describe("Keywords to weave in naturally."),
  knownMetrics: z
    .array(z.string())
    .default([])
    .describe("Real metrics you remember, e.g. 'cut deploy time from 40min to 6min'. NEVER invent metrics."),
});

export interface RewrittenBullet {
  original: string;
  rewritten: string;
  notes: string[];
  needsMetric: boolean;
}

export interface RewriteExperienceResult {
  title: string;
  company: string;
  bullets: RewrittenBullet[];
  suggestions: string[];
}

const VERB_UPGRADES: Array<[RegExp, string]> = [
  [/^(was\s+)?responsible for\s+/i, "Owned "],
  [/^worked on\s+/i, "Built "],
  [/^helped( with)?\s+/i, "Contributed to "],
  [/^assisted( with| in)?\s+/i, "Supported "],
  [/^participated in\s+/i, "Drove "],
  [/^involved in\s+/i, "Delivered "],
  [/^managed\s+/i, "Led "],
  [/^created\s+/i, "Built "],
  [/^made\s+/i, "Built "],
];

export function rewriteBullet(bullet: string, keywords: string[]): RewrittenBullet {
  const notes: string[] = [];
  let text = bullet.trim().replace(/^[-•*]\s*/, "");

  for (const [re, repl] of VERB_UPGRADES) {
    if (re.test(text)) {
      text = text.replace(re, repl);
      notes.push(`Upgraded weak opener to "${repl.trim()}".`);
      break;
    }
  }

  for (const weak of WEAK_PHRASES) {
    if (text.toLowerCase().includes(weak) && !notes.some((n) => n.includes(weak))) {
      notes.push(`Contains weak phrase "${weak}" — consider replacing with a concrete outcome.`);
    }
  }

  // Capitalize first letter
  text = text.charAt(0).toUpperCase() + text.slice(1);

  const hasMetric = /\d/.test(text);
  if (!hasMetric) {
    notes.push("No metric. Add one you can defend: %, time saved, users, revenue, scale.");
  }

  const missingKw = keywords.filter((k) => !text.toLowerCase().includes(k.toLowerCase()));
  if (missingKw.length > 0 && keywords.length > 0) {
    notes.push(`Could mention: ${missingKw.slice(0, 3).join(", ")} — only if truthful for this role.`);
  }

  return { original: bullet, rewritten: text, notes, needsMetric: !hasMetric };
}

export function runRewriteExperience(
  exp: Experience,
  targetKeywords: string[],
  knownMetrics: string[]
): RewriteExperienceResult {
  const bullets = (exp.bullets.length ? exp.bullets : (exp.description ? [exp.description] : [])).map(
    (b) => rewriteBullet(b, targetKeywords)
  );

  const suggestions: string[] = [];
  if (knownMetrics.length > 0) {
    suggestions.push(
      `Weave these real metrics into the bullets that describe the matching work: ${knownMetrics.join("; ")}.`
    );
  } else if (bullets.some((b) => b.needsMetric)) {
    suggestions.push(
      "Provide knownMetrics for this role so bullets can carry real numbers — this tool never invents metrics."
    );
  }
  if (bullets.length < 3) suggestions.push("Aim for 3-5 bullets per role.");
  if (bullets.length > 6) suggestions.push("Trim to the 5-6 highest-impact bullets.");

  return { title: exp.title, company: exp.company, bullets, suggestions };
}
