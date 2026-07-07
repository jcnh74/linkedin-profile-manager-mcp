/**
 * generate_headline_variants — draft-only headline options per target role.
 * LinkedIn headline limit: 220 chars.
 */
import { z } from "zod";
import { Profile, TargetRoleEnum, TargetRole, ROLE_LABELS } from "../types.js";

export const GenerateHeadlineVariantsInput = z.object({
  targetRole: TargetRoleEnum,
  emphasis: z
    .array(z.enum(["outcomes", "stack", "consulting", "creator", "open-to-work"]))
    .default(["outcomes", "stack"]),
  count: z.number().int().min(1).max(8).default(5),
});

export interface HeadlineVariant {
  text: string;
  chars: number;
  style: string;
  fits: boolean; // <= 220 chars
}

const MAX = 220;

function topSkills(profile: Profile, role: TargetRole): string[] {
  const preferred: Record<TargetRole, string[]> = {
    "senior-full-stack-engineer": ["React", "Node.js", "TypeScript", "AWS"],
    "agentic-ai-systems-engineer": ["LLM Agents", "MCP", "TypeScript", "Python"],
    "ai-automation-consultant": ["LLM Integration", "Workflow Automation", "API Design"],
    "react-python-php-engineer": ["React", "Python", "PHP", "Laravel"],
  };
  const fromProfile = profile.skills.slice(0, 3);
  return fromProfile.length >= 3 ? fromProfile : preferred[role];
}

export function runGenerateHeadlineVariants(
  profile: Profile,
  targetRole: TargetRole,
  count: number
): HeadlineVariant[] {
  const label = ROLE_LABELS[targetRole];
  const skills = topSkills(profile, targetRole);
  const s3 = skills.slice(0, 3).join(" · ");

  const templates: Array<{ style: string; text: string }> = [
    {
      style: "role + stack",
      text: `${label} | ${s3}`,
    },
    {
      style: "outcome-led",
      text: `${label} — I build production ${targetRole.includes("ai") ? "AI agent systems" : "web platforms"} that ship, scale, and pay for themselves | ${s3}`,
    },
    {
      style: "recruiter-optimized",
      text: `${label} | ${skills.join(" | ")} | Remote`,
    },
    {
      style: "consultant / conversion",
      text: `I help teams ${targetRole === "ai-automation-consultant" ? "automate workflows with LLMs and agents" : "ship reliable software faster"} → ${label} | ${s3}`,
    },
    {
      style: "creator / thought-leader",
      text: `${label} · Building in public: agentic systems, MCP servers & AI automation · ${s3}`,
    },
    {
      style: "hybrid seniority",
      text: `Senior Engineer → ${label} | ${s3} | 10+ yrs shipping production software`,
    },
    {
      style: "minimal",
      text: `${label}`,
    },
    {
      style: "problem-focused",
      text: `Turning manual processes into agentic AI systems | ${label} | ${s3}`,
    },
  ];

  return templates.slice(0, count).map((t) => ({
    text: t.text.slice(0, MAX),
    chars: Math.min(t.text.length, MAX),
    style: t.style,
    fits: t.text.length <= MAX,
  }));
}
