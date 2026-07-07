/**
 * audit_profile — score the locally stored profile across 5 dimensions.
 * Pure analysis, no network.
 */
import { z } from "zod";
import { Profile, TargetRoleEnum, TargetRole } from "../types.js";
import {
  ROLE_KEYWORDS,
  GENERIC_STRONG_SIGNALS,
  WEAK_PHRASES,
  keywordCoverage,
} from "../keywords.js";

export const AuditProfileInput = z.object({
  targetRole: TargetRoleEnum.default("agentic-ai-systems-engineer"),
});

export interface DimensionScore {
  dimension: string;
  score: number; // 0-100
  findings: string[];
  recommendations: string[];
}

export interface AuditResult {
  targetRole: TargetRole;
  overall: number;
  dimensions: DimensionScore[];
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function runAuditProfile(profile: Profile, targetRole: TargetRole): AuditResult {
  const fullText = [
    profile.headline,
    profile.about,
    ...profile.experience.flatMap((e) => [e.title, e.company, ...(e.bullets ?? []), e.description ?? ""]),
    ...profile.skills,
  ].join("\n");

  const kw = keywordCoverage(fullText, ROLE_KEYWORDS[targetRole]);

  // 1. Recruiter searchability
  const searchability: DimensionScore = {
    dimension: "Recruiter searchability",
    score: clamp(kw.score * 0.8 + (profile.skills.length >= 20 ? 20 : profile.skills.length)),
    findings: [
      `Keyword coverage for target role: ${kw.score}% (${kw.present.length}/${kw.present.length + kw.missing.length})`,
      `Skills listed: ${profile.skills.length} (LinkedIn allows 50; recruiters filter on these)`,
    ],
    recommendations: [
      ...(kw.missing.length > 0 ? [`Add missing keywords naturally: ${kw.missing.slice(0, 8).join(", ")}`] : []),
      ...(profile.skills.length < 20 ? ["Add more skills — aim for 30-50, ordered by relevance."] : []),
    ],
  };

  // 2. Clarity
  const headlineLen = profile.headline.length;
  const aboutWords = profile.about.split(/\s+/).filter(Boolean).length;
  const weakHits = WEAK_PHRASES.filter((p) => fullText.toLowerCase().includes(p));
  const clarity: DimensionScore = {
    dimension: "Clarity",
    score: clamp(
      100 -
        weakHits.length * 12 -
        (headlineLen === 0 ? 40 : headlineLen > 220 ? 15 : 0) -
        (aboutWords < 50 ? 25 : aboutWords > 500 ? 10 : 0)
    ),
    findings: [
      `Headline length: ${headlineLen}/220 chars`,
      `About length: ${aboutWords} words (sweet spot ~150-350)`,
      ...(weakHits.length ? [`Weak/cliché phrases found: ${weakHits.join(", ")}`] : ["No weak phrases detected."]),
    ],
    recommendations: weakHits.length
      ? ["Replace clichés with concrete outcomes (metrics, tech, scale)."]
      : [],
  };

  // 3. Credibility (measurable impact)
  const bullets = profile.experience.flatMap((e) => e.bullets ?? []);
  const withNumbers = bullets.filter((b) => /\d/.test(b));
  const strongVerbs = bullets.filter((b) =>
    GENERIC_STRONG_SIGNALS.some((v) => b.toLowerCase().startsWith(v))
  );
  const credibility: DimensionScore = {
    dimension: "Credibility / measurable impact",
    score: clamp(
      bullets.length === 0
        ? 20
        : (withNumbers.length / bullets.length) * 60 + (strongVerbs.length / bullets.length) * 40
    ),
    findings: [
      `${withNumbers.length}/${bullets.length} experience bullets contain metrics`,
      `${strongVerbs.length}/${bullets.length} bullets start with strong action verbs`,
    ],
    recommendations: [
      ...(withNumbers.length < bullets.length / 2
        ? ["Quantify impact: latency, revenue, users, uptime, cost, team size."]
        : []),
      ...(bullets.length === 0 ? ["Experience entries have no bullets — add 3-5 per role."] : []),
    ],
  };

  // 4. AI/engineering positioning
  const aiTerms = ROLE_KEYWORDS["agentic-ai-systems-engineer"];
  const aiCov = keywordCoverage(fullText, aiTerms);
  const positioning: DimensionScore = {
    dimension: "AI/engineering positioning",
    score: clamp(aiCov.score + (profile.featuredLinks.length > 0 ? 15 : 0)),
    findings: [
      `AI/agentic keyword coverage: ${aiCov.score}%`,
      `Featured links: ${profile.featuredLinks.length}`,
    ],
    recommendations: [
      ...(aiCov.missing.length > 0
        ? [`Consider weaving in: ${aiCov.missing.slice(0, 6).join(", ")}`]
        : []),
      ...(profile.featuredLinks.length === 0
        ? ["Add Featured items: demo videos, GitHub repos, case studies, talks."]
        : []),
    ],
  };

  // 5. Conversion (does the profile drive action?)
  const hasCTA = /\b(dm|reach out|contact|book|let'?s talk|email me|open to)\b/i.test(profile.about);
  const conversion: DimensionScore = {
    dimension: "Conversion",
    score: clamp((hasCTA ? 50 : 10) + (profile.featuredLinks.length > 0 ? 25 : 0) + (profile.customUrl ? 25 : 0)),
    findings: [
      hasCTA ? "About section contains a call to action." : "No call to action in About.",
      profile.customUrl ? `Custom URL set: ${profile.customUrl}` : "No custom profile URL detected.",
    ],
    recommendations: [
      ...(!hasCTA ? ["End About with a clear CTA (what to contact you for + how)."] : []),
      ...(!profile.customUrl ? ["Claim a clean custom URL: linkedin.com/in/yourname."] : []),
    ],
  };

  const dimensions = [searchability, clarity, credibility, positioning, conversion];
  const overall = clamp(dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length);
  return { targetRole, overall, dimensions };
}
