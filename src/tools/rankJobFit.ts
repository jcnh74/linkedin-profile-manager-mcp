/**
 * rank_job_fit — score cached jobs (or one pasted JD) against the profile
 * snapshot. Pure local analysis.
 */
import { z } from "zod";
import { Profile } from "../types.js";
import { Job } from "../jobs/jobSources.js";
import { JobStore } from "../jobs/jobStore.js";
import { extractKeywordsFromJD, keywordCoverage } from "../keywords.js";

export const RankJobFitInput = z.object({
  jobId: z.string().optional().describe("Rank a single cached job. Omit to rank ALL cached jobs."),
  minScore: z.number().min(0).max(100).default(0).describe("Only return jobs at or above this fit score."),
  top: z.number().int().min(1).max(50).default(10),
});

export interface JobFit {
  jobId: string;
  title: string;
  company: string;
  url: string;
  score: number; // 0-100
  matched: string[];
  missing: string[];
  titleMatch: boolean;
}

function profileText(p: Profile): string {
  return [
    p.headline,
    p.about,
    ...p.experience.flatMap((e) => [e.title, ...(e.bullets ?? []), e.description ?? ""]),
    ...p.skills,
  ].join("\n");
}

const TITLE_HINTS = [
  "full stack", "fullstack", "software engineer", "ai", "agent", "llm",
  "automation", "react", "python", "php", "typescript", "senior", "founding",
];

export function scoreJob(job: Job, profile: Profile): JobFit {
  const jdText = `${job.title}\n${job.tags.join(" ")}\n${job.description}`;
  const jdKeywords = extractKeywordsFromJD(jdText, 30);
  const pText = profileText(profile);

  // How many of the JD's keywords does the profile cover?
  const cov = keywordCoverage(pText, jdKeywords);

  // Title affinity: does the job title look like the user's space?
  const t = job.title.toLowerCase();
  const titleHits = TITLE_HINTS.filter((h) => t.includes(h)).length;
  const titleMatch = titleHits > 0;

  const score = Math.round(Math.min(100, cov.score * 0.75 + Math.min(titleHits, 3) * 8 + (titleMatch ? 5 : 0)));

  return {
    jobId: job.id,
    title: job.title,
    company: job.company,
    url: job.url,
    score,
    matched: cov.present.slice(0, 10),
    missing: cov.missing.slice(0, 8),
    titleMatch,
  };
}

export function runRankJobFit(
  args: { jobId?: string; minScore: number; top: number },
  profile: Profile,
  store: JobStore
): { ranked: JobFit[]; totalCached: number; advice: string } {
  const jobs = store.loadJobs();
  const pool = args.jobId ? jobs.filter((j) => j.id === args.jobId) : jobs;
  if (args.jobId && pool.length === 0) {
    throw new Error(`Job ${args.jobId} not in cache. Run scan_jobs first.`);
  }
  const ranked = pool
    .map((j) => scoreJob(j, profile))
    .filter((f) => f.score >= args.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, args.top);

  return {
    ranked,
    totalCached: jobs.length,
    advice:
      "Scores are keyword-based fit estimates, not judgments. 60+ = strong overlap worth an application; " +
      "'missing' keywords are what to address in prepare_application talking points (only if truthful).",
  };
}
