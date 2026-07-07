/**
 * keyword_gap_analysis — compare profile against target job descriptions or
 * a consulting positioning statement. Recommends missing keywords and where
 * to place them.
 */
import { z } from "zod";
import { Profile, TargetRoleEnum, TargetRole } from "../types.js";
import { ROLE_KEYWORDS, keywordCoverage, extractKeywordsFromJD } from "../keywords.js";

export const KeywordGapInput = z.object({
  jobDescriptions: z
    .array(z.string())
    .default([])
    .describe("Paste 1-3 target job descriptions, or a consulting offer/positioning statement."),
  targetRole: TargetRoleEnum.optional().describe("Fallback keyword bank if no JD is provided."),
});

export interface KeywordPlacement {
  keyword: string;
  frequencyInTargets: number;
  suggestedPlacement: string;
}

export interface KeywordGapResult {
  coveragePercent: number;
  present: string[];
  gaps: KeywordPlacement[];
  advice: string[];
}

function placementFor(keyword: string, profile: Profile): string {
  const k = keyword.toLowerCase();
  const isTech = /(react|python|php|node|typescript|javascript|sql|aws|docker|api|llm|mcp|rag|graphql|django|laravel|fastapi|vector)/.test(k);
  if (isTech) {
    if (profile.skills.length < 50) return "Skills section + one experience bullet where you actually used it";
    return "An experience bullet where you actually used it";
  }
  if (/(lead|mentor|architect|design|strategy|consult)/.test(k)) {
    return "Headline or About (positioning language)";
  }
  return "About section, woven into a sentence about real work";
}

export function runKeywordGapAnalysis(
  profile: Profile,
  jobDescriptions: string[],
  targetRole?: TargetRole
): KeywordGapResult {
  const profileText = [
    profile.headline,
    profile.about,
    ...profile.experience.flatMap((e) => [e.title, ...(e.bullets ?? []), e.description ?? ""]),
    ...profile.skills,
  ].join("\n");

  let targetKeywords: string[];
  const freq = new Map<string, number>();

  if (jobDescriptions.length > 0) {
    for (const jd of jobDescriptions) {
      for (const k of extractKeywordsFromJD(jd)) {
        freq.set(k, (freq.get(k) ?? 0) + 1);
      }
    }
    targetKeywords = [...freq.keys()];
  } else {
    targetKeywords = ROLE_KEYWORDS[targetRole ?? "agentic-ai-systems-engineer"];
    for (const k of targetKeywords) freq.set(k, 1);
  }

  const cov = keywordCoverage(profileText, targetKeywords);
  const gaps: KeywordPlacement[] = cov.missing
    .sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0))
    .slice(0, 20)
    .map((keyword) => ({
      keyword,
      frequencyInTargets: freq.get(keyword) ?? 0,
      suggestedPlacement: placementFor(keyword, profile),
    }));

  const advice = [
    "Only add keywords for skills you genuinely have — recruiters verify in interviews.",
    "Place the top 3 gaps in your headline or first two About lines; LinkedIn search weights those heavily.",
    ...(profile.skills.length < 30 ? ["Your Skills section has room — it's the highest-leverage, lowest-effort placement."] : []),
  ];

  return { coveragePercent: cov.score, present: cov.present, gaps, advice };
}
