/**
 * rewrite_about_section — draft-only About section variants.
 * LinkedIn About limit: 2600 chars.
 */
import { z } from "zod";
import { Profile } from "../types.js";

export const AboutStyleEnum = z.enum([
  "concise",
  "technical",
  "founder-consultant",
  "recruiter-friendly",
  "ai-forward",
]);
export type AboutStyle = z.infer<typeof AboutStyleEnum>;

export const RewriteAboutInput = z.object({
  styles: z.array(AboutStyleEnum).default(["concise", "technical", "ai-forward"]),
  extraContext: z
    .string()
    .optional()
    .describe("Anything the current About doesn't capture: niche, wins, target clients."),
});

export interface AboutVariant {
  style: AboutStyle;
  text: string;
  chars: number;
  fits: boolean; // <= 2600
}

const MAX = 2600;

function facts(profile: Profile) {
  const years = profile.experience.length;
  const companies = profile.experience.map((e) => e.company).filter(Boolean).slice(0, 3);
  const skills = profile.skills.slice(0, 6);
  const name = profile.name?.split(" ")[0] ?? "I";
  return { years, companies, skills, name };
}

export function runRewriteAbout(
  profile: Profile,
  styles: AboutStyle[],
  extraContext?: string
): AboutVariant[] {
  const f = facts(profile);
  const skillLine = f.skills.length ? f.skills.join(", ") : "TypeScript, React, Python, LLM agents";
  const ctx = extraContext ? `\n\n${extraContext}` : "";

  const bodies: Record<AboutStyle, string> = {
    concise: [
      `Engineer who ships. ${f.skills.slice(0, 3).join(" · ") || "Full stack + AI"}.`,
      ``,
      `I build production systems end to end — from schema to UI to deployment — and lately, agentic AI systems that do real work instead of demos.`,
      ``,
      `Currently: open to senior engineering and AI automation work.`,
      `→ Message me here or check Featured for recent projects.${ctx}`,
    ].join("\n"),

    technical: [
      `Stack: ${skillLine}.`,
      ``,
      `What I actually do:`,
      `• Design and ship full-stack products (${f.skills.slice(0, 2).join(", ") || "React, Node"}) with CI/CD, tests, and observability from day one.`,
      `• Build agentic AI systems: MCP servers, tool-calling pipelines, RAG, evals — engineered like software, not prompt spaghetti.`,
      `• Modernize legacy codebases without stopping the release train.`,
      ``,
      `${f.companies.length ? `Previously: ${f.companies.join(", ")}.` : ""}`,
      ``,
      `Featured section has code and case studies. DM for the rest.${ctx}`,
    ].join("\n"),

    "founder-consultant": [
      `I help companies turn manual processes into AI-powered systems that pay for themselves.`,
      ``,
      `Typical engagement: find the workflow eating your team's week → design an agentic automation around it → ship it to production with monitoring and a rollback plan. No slideware, working software.`,
      ``,
      `Background: ${f.years || "10+"} roles shipping production systems (${skillLine}).`,
      ``,
      `Booking discovery calls for Q3 — message me with the process you want to automate.${ctx}`,
    ].join("\n"),

    "recruiter-friendly": [
      `Senior Full Stack Engineer | ${skillLine}`,
      ``,
      `${f.years || "Multiple"} production roles across web platforms, APIs, and AI systems. Comfortable owning features end to end: requirements → architecture → implementation → deploy → iterate.`,
      ``,
      `Highlights:`,
      `• Full stack: React/TypeScript frontends, Node/Python backends, SQL/NoSQL, AWS.`,
      `• AI engineering: LLM integrations, agent orchestration, MCP, retrieval pipelines.`,
      `• Team fit: remote-first, async-friendly, mentoring experience.`,
      ``,
      `Open to: senior IC roles, staff-track, or contract. Fastest way to reach me is a LinkedIn message.${ctx}`,
    ].join("\n"),

    "ai-forward": [
      `I build AI systems that survive contact with production.`,
      ``,
      `The gap between an impressive demo and a dependable system is engineering: evals, guardrails, human-in-the-loop approvals, observability, cost control. That's the work I do.`,
      ``,
      `Recent focus: agentic architectures — MCP servers, multi-tool agents, automation pipelines that businesses actually trust with real tasks.`,
      ``,
      `Foundation: ${f.years || "10+"} roles of full-stack engineering (${skillLine}), so the AI sits on solid software.`,
      ``,
      `Building something agentic? Let's talk — DMs open.${ctx}`,
    ].join("\n"),
  };

  return styles.map((style) => {
    const text = bodies[style].slice(0, MAX);
    return { style, text, chars: text.length, fits: bodies[style].length <= MAX };
  });
}
