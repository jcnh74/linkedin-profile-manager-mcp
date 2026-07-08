/**
 * prepare_application — everything up to (but not including) submitting:
 *  - fit summary against the profile snapshot
 *  - tailored talking points (only from real profile content)
 *  - cover note draft
 *  - the apply URL for the HUMAN to open and submit
 * Never auto-applies. Application record saved to the local tracker as 'preparing'.
 */
import { z } from "zod";
import { Profile } from "../types.js";
import { JobStore } from "../jobs/jobStore.js";
import { scoreJob } from "./rankJobFit.js";

export const PrepareApplicationInput = z.object({
  jobId: z.string().describe("A cached job id from scan_jobs / rank_job_fit."),
  tone: z.enum(["direct", "warm", "formal"]).default("direct"),
  extraContext: z.string().optional().describe("Anything relevant not on the profile (availability, visa, rate...)."),
});

export interface PreparedApplication {
  job: { id: string; title: string; company: string; url: string };
  fitScore: number;
  matchedKeywords: string[];
  talkingPoints: string[];
  coverNote: string;
  applyInstructions: string;
  trackerStatus: string;
}

export function runPrepareApplication(
  args: z.infer<typeof PrepareApplicationInput>,
  profile: Profile,
  store: JobStore
): PreparedApplication {
  const job = store.getJob(args.jobId);
  if (!job) throw new Error(`Job ${args.jobId} not in cache. Run scan_jobs first.`);

  const fit = scoreJob(job, profile);

  // Talking points strictly from real profile content that overlaps the JD
  const talkingPoints: string[] = [];
  const relevantExp = profile.experience.slice(0, 3);
  for (const kw of fit.matched.slice(0, 5)) {
    const exp = relevantExp.find(
      (e) =>
        e.title.toLowerCase().includes(kw) ||
        (e.bullets ?? []).some((b) => b.toLowerCase().includes(kw))
    );
    talkingPoints.push(
      exp
        ? `"${kw}" → point to your ${exp.title} work at ${exp.company}.`
        : `"${kw}" → covered in your skills/About; be ready with a concrete example.`
    );
  }
  if (fit.missing.length > 0) {
    talkingPoints.push(
      `Gaps to address honestly if asked: ${fit.missing.slice(0, 4).join(", ")} — bridge with adjacent experience, don't claim them.`
    );
  }

  const name = profile.name?.split(" ")[0] ?? "";
  const headlineBit = profile.headline?.split("|")[0]?.trim() || "engineer";
  const strongest = fit.matched.slice(0, 3).join(", ");

  const openers: Record<string, string> = {
    direct: `I'm a ${headlineBit} and the ${job.title} role at ${job.company} lines up closely with what I do:`,
    warm: `The ${job.title} opening at ${job.company} caught my eye — it overlaps almost exactly with the work I enjoy most.`,
    formal: `I am writing to express interest in the ${job.title} position at ${job.company}.`,
  };

  const coverNote = [
    openers[args.tone],
    ``,
    `Relevant background: ${strongest || "full-stack and AI systems engineering"}.`,
    ...(relevantExp[0]
      ? [`Most recently: ${relevantExp[0].title} at ${relevantExp[0].company}${relevantExp[0].bullets?.[0] ? ` — ${relevantExp[0].bullets[0].toLowerCase()}` : ""}.`]
      : []),
    ...(args.extraContext ? [``, args.extraContext] : []),
    ``,
    `Happy to walk through recent projects. ${name ? `— ${name}` : ""}`.trim(),
  ].join("\n");

  store.upsertApplication({ jobId: job.id, status: "preparing", notes: `fit ${fit.score}/100` });

  return {
    job: { id: job.id, title: job.title, company: job.company, url: job.url },
    fitScore: fit.score,
    matchedKeywords: fit.matched,
    talkingPoints,
    coverNote,
    applyInstructions:
      `Review the note, personalize one line, then open ${job.url} and submit the application YOURSELF. ` +
      `This server never auto-submits. When done, call track_applications with status=applied.`,
    trackerStatus: "preparing",
  };
}
