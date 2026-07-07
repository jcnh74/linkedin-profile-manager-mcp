import { describe, it, expect } from "vitest";
import { ProfileSchema } from "../src/types.js";
import { runAuditProfile } from "../src/tools/auditProfile.js";
import { runGenerateHeadlineVariants } from "../src/tools/generateHeadlineVariants.js";
import { runRewriteAbout } from "../src/tools/rewriteAbout.js";
import { runRewriteExperience, rewriteBullet } from "../src/tools/rewriteExperience.js";
import { runKeywordGapAnalysis } from "../src/tools/keywordGapAnalysis.js";

const profile = ProfileSchema.parse({
  name: "John Doe",
  headline: "Senior Full Stack Engineer | React, Node.js",
  about:
    "I build production web platforms and agentic AI systems. LLM tool calling, MCP servers, RAG pipelines. DM me to talk about your project.",
  skills: ["React", "Node.js", "TypeScript", "Python", "AWS", "Docker"],
  featuredLinks: [{ title: "GitHub", url: "https://github.com/johndoe" }],
  customUrl: "linkedin.com/in/johndoe",
  experience: [
    {
      title: "Senior Engineer",
      company: "Acme Corp",
      bullets: [
        "Built a customer portal in React serving 40k users",
        "responsible for maintaining the API",
      ],
    },
  ],
});

describe("audit_profile", () => {
  it("returns 5 dimensions with 0-100 scores and an overall", () => {
    const res = runAuditProfile(profile, "agentic-ai-systems-engineer");
    expect(res.dimensions).toHaveLength(5);
    for (const d of res.dimensions) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
    }
    expect(res.overall).toBeGreaterThan(0);
    expect(res.overall).toBeLessThanOrEqual(100);
  });

  it("flags weak phrases in clarity findings", () => {
    const res = runAuditProfile(profile, "senior-full-stack-engineer");
    const clarity = res.dimensions.find((d) => d.dimension === "Clarity")!;
    expect(clarity.findings.join(" ")).toContain("responsible for");
  });

  it("scores empty profiles low", () => {
    const empty = ProfileSchema.parse({});
    const res = runAuditProfile(empty, "agentic-ai-systems-engineer");
    expect(res.overall).toBeLessThan(40);
  });
});

describe("generate_headline_variants", () => {
  it("generates requested count, all within 220 chars", () => {
    const variants = runGenerateHeadlineVariants(profile, "agentic-ai-systems-engineer", 5);
    expect(variants).toHaveLength(5);
    for (const v of variants) {
      expect(v.text.length).toBeLessThanOrEqual(220);
      expect(v.fits).toBe(true);
      expect(v.style).toBeTruthy();
    }
  });

  it("mentions the role label", () => {
    const variants = runGenerateHeadlineVariants(profile, "ai-automation-consultant", 3);
    expect(variants.some((v) => v.text.includes("AI Automation Consultant"))).toBe(true);
  });
});

describe("rewrite_about_section", () => {
  it("produces all 5 styles within 2600 chars", () => {
    const res = runRewriteAbout(profile, [
      "concise",
      "technical",
      "founder-consultant",
      "recruiter-friendly",
      "ai-forward",
    ]);
    expect(res).toHaveLength(5);
    for (const v of res) {
      expect(v.chars).toBeLessThanOrEqual(2600);
      expect(v.text.length).toBeGreaterThan(50);
    }
  });

  it("includes extra context when provided", () => {
    const res = runRewriteAbout(profile, ["concise"], "Niche: MCP servers for fintech.");
    expect(res[0].text).toContain("MCP servers for fintech");
  });
});

describe("rewrite_experience", () => {
  it("upgrades weak openers and flags missing metrics", () => {
    const b = rewriteBullet("responsible for maintaining the API", ["node.js"]);
    expect(b.rewritten.startsWith("Owned")).toBe(true);
    expect(b.needsMetric).toBe(true);
  });

  it("does not invent metrics; asks for knownMetrics instead", () => {
    const res = runRewriteExperience(profile.experience[0], [], []);
    expect(res.suggestions.join(" ")).toContain("never invents metrics");
    // rewritten text must not contain digits that weren't in the original
    const noMetricBullet = res.bullets[1];
    expect(/\d/.test(noMetricBullet.rewritten)).toBe(false);
  });

  it("passes through known metrics as suggestions", () => {
    const res = runRewriteExperience(profile.experience[0], [], ["cut deploy time from 40min to 6min"]);
    expect(res.suggestions.join(" ")).toContain("40min to 6min");
  });
});

describe("keyword_gap_analysis", () => {
  it("finds gaps against a job description", () => {
    const jd = `We are hiring a Senior AI Engineer. Requirements: kubernetes kubernetes experience,
      golang golang services, terraform terraform infrastructure, llm llm agents, python python.`;
    const res = runKeywordGapAnalysis(profile, [jd]);
    expect(res.coveragePercent).toBeGreaterThanOrEqual(0);
    const gapWords = res.gaps.map((g) => g.keyword);
    expect(gapWords).toContain("kubernetes");
    expect(gapWords).toContain("terraform");
    // python is already on the profile
    expect(gapWords).not.toContain("python");
  });

  it("falls back to role keyword bank without a JD", () => {
    const res = runKeywordGapAnalysis(profile, [], "agentic-ai-systems-engineer");
    expect(res.present).toContain("mcp");
    expect(res.gaps.length).toBeGreaterThan(0);
    expect(res.gaps[0].suggestedPlacement).toBeTruthy();
  });
});
