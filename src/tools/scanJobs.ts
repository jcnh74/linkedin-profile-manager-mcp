/**
 * scan_jobs — fetch jobs from legitimate public APIs (Remotive, RemoteOK),
 * cache locally, and build a LinkedIn search URL for manual browsing.
 * No LinkedIn scraping.
 */
import { z } from "zod";
import {
  Job,
  fetchRemotive,
  fetchRemoteOK,
  buildLinkedInJobSearchUrl,
  FetchLike,
} from "../jobs/jobSources.js";
import { JobStore } from "../jobs/jobStore.js";

export const ScanJobsInput = z.object({
  query: z.string().min(2).describe("e.g. 'senior full stack engineer' or 'ai agents typescript'"),
  sources: z.array(z.enum(["remotive", "remoteok"])).default(["remotive", "remoteok"]),
  limit: z.number().int().min(1).max(50).default(20).describe("max results per source"),
});
export type ScanJobsArgs = z.infer<typeof ScanJobsInput>;

export interface ScanJobsResult {
  jobs: Array<Pick<Job, "id" | "title" | "company" | "location" | "url" | "salary" | "postedAt" | "source">>;
  cached: number;
  cachePath: string;
  linkedInSearchUrl: string;
  errors: string[];
  note: string;
}

export async function runScanJobs(
  args: ScanJobsArgs,
  store: JobStore,
  fetchImpl: FetchLike = fetch
): Promise<ScanJobsResult> {
  const jobs: Job[] = [];
  const errors: string[] = [];

  const tasks: Array<Promise<Job[]>> = [];
  if (args.sources.includes("remotive")) tasks.push(fetchRemotive(args.query, args.limit, fetchImpl));
  if (args.sources.includes("remoteok")) tasks.push(fetchRemoteOK(args.query, args.limit, fetchImpl));

  const settled = await Promise.allSettled(tasks);
  for (const s of settled) {
    if (s.status === "fulfilled") jobs.push(...s.value);
    else errors.push(String(s.reason));
  }

  const cachePath = store.saveJobs(jobs);
  return {
    jobs: jobs.map(({ id, title, company, location, url, salary, postedAt, source }) => ({
      id, title, company, location, url, salary, postedAt, source,
    })),
    cached: jobs.length,
    cachePath,
    linkedInSearchUrl: buildLinkedInJobSearchUrl({ keywords: args.query, senior: true }),
    errors,
    note:
      "Jobs cached locally (full descriptions included) — run rank_job_fit next. " +
      "LinkedIn listings can't be fetched compliantly; open linkedInSearchUrl in your browser to review those manually. " +
      "RemoteOK data courtesy of remoteok.com.",
  };
}
