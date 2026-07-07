/**
 * Shared types + Zod schemas for the LinkedIn profile domain.
 * The profile snapshot is always user-provided (pasted text, exported PDF text,
 * or structured JSON). We never scrape it by default.
 */
import { z } from "zod";

export const ExperienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  startDate: z.string().optional().describe("e.g. '2021-03' or 'Mar 2021'"),
  endDate: z.string().optional().describe("empty/undefined = present"),
  location: z.string().optional(),
  bullets: z.array(z.string()).default([]),
  description: z.string().optional(),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const ProfileSchema = z.object({
  name: z.string().optional(),
  headline: z.string().default(""),
  about: z.string().default(""),
  location: z.string().optional(),
  experience: z.array(ExperienceSchema).default([]),
  skills: z.array(z.string()).default([]),
  featuredLinks: z
    .array(z.object({ title: z.string(), url: z.string() }))
    .default([]),
  education: z
    .array(
      z.object({
        school: z.string(),
        degree: z.string().optional(),
        dates: z.string().optional(),
      })
    )
    .default([]),
  openToWork: z.boolean().optional(),
  customUrl: z.string().optional().describe("linkedin.com/in/<slug>"),
  rawText: z.string().optional().describe("original pasted/PDF text, kept for reference"),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const TargetRoleEnum = z.enum([
  "senior-full-stack-engineer",
  "agentic-ai-systems-engineer",
  "ai-automation-consultant",
  "react-python-php-engineer",
]);
export type TargetRole = z.infer<typeof TargetRoleEnum>;

export const ROLE_LABELS: Record<TargetRole, string> = {
  "senior-full-stack-engineer": "Senior Full Stack Engineer",
  "agentic-ai-systems-engineer": "Agentic AI Systems Engineer",
  "ai-automation-consultant": "AI Automation Consultant",
  "react-python-php-engineer": "React/Python/PHP Engineer",
};

/** A single proposed change, used by update plans and patch exports. */
export interface ProposedChange {
  field: string; // exact LinkedIn field name, e.g. "Headline", "About", "Experience > Acme Corp > Senior Engineer"
  editUrl: string; // where to make the change manually
  oldText: string;
  newText: string;
  rationale: string;
  risk: "read-only" | "draft-only" | "manual-edit" | "publishes-content";
}
