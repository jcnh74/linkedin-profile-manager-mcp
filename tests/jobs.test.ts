import { describe, it, expect } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { ProfileSchema } from "../src/types.js";
import { JobStore } from "../src/jobs/jobStore.js";
import { buildLinkedInJobSearchUrl, JobSchema } from "../src/jobs/jobSources.js";
import { runScanJobs } from "../src/tools/scanJobs.js";
import { runRankJobFit, scoreJob } from "../src/tools/rankJobFit.js";
import { runPrepareApplication } from "../src/tools/prepareApplication.js";
import { runTrackApplications } from "../src/tools/trackApplications.js";

function tmpJobStore() {
  return new JobStore(fs.mkdtempSync(path.join(os.tmpdir(), "li-jobs-")));
}

const profile = ProfileSchema.parse({
  name: "John Doe",
  headline: "Senior Full Stack Engineer | React, TypeScript, AI Agents",
  about: "I build agentic AI systems with typescript, python, react, node, llm tool calling and mcp servers.",
  skills: ["React", "TypeScript", "Python", "Node.js", "LLM", "MCP"],
  experience: [
    {
      title: "Senior Engineer",
      company: "Acme Corp",
      bullets: ["Built agentic ai pipelines with typescript and python serving 40k users"],
    },
  ],
});

const goodJob = JobSchema.parse({
  id: "remotive-1",
  source: "remotive",
  title: "Senior Full Stack Engineer (AI Agents)",
  company: "AgentCo",
  url: "https://remotive.com/jobs/1",
  description:
    "We need typescript typescript react react python python experience building llm llm agents agents. Node node required. MCP mcp a plus.",
  tags: ["typescript", "react", "ai"],
});

const badJob = JobSchema.parse({
  id: "remoteok-2",
  source: "remoteok",
  title: "Accountant",
  company: "LedgerCo",
  url: "https://remoteok.com/jobs/2",
  description:
    "Bookkeeping bookkeeping ledgers ledgers gaap gaap auditing auditing payroll payroll excel excel cpa cpa required.",
  tags: ["finance"],
});

// Mock fetch matching Remotive + RemoteOK response shapes
const mockFetch = (async (url: string) => {
  if (String(url).includes("remotive.com")) {
    return new Response(
      JSON.stringify({
        jobs: [
          {
            id: 1,
            title: goodJob.title,
            company_name: goodJob.company,
            url: goodJob.url,
            description: `<p>${goodJob.description}</p>`,
            tags: goodJob.tags,
            candidate_required_location: "Remote",
            publication_date: "2026-07-01",
          },
        ],
      }),
      { status: 200 }
    );
  }
  return new Response(
    JSON.stringify([
      { legal: "notice" },
      {
        id: 2,
        position: "Accountant",
        company: "LedgerCo",
        url: badJob.url,
        description: badJob.description,
        tags: ["finance"],
        location: "Remote",
        date: "2026-07-02",
      },
    ]),
    { status: 200 }
  );
}) as typeof fetch;

describe("scan_jobs", () => {
  it("fetches from both sources, caches locally, returns LinkedIn search URL", async () => {
    const store = tmpJobStore();
    const res = await runScanJobs(
      { query: "accountant", sources: ["remotive", "remoteok"], limit: 10 },
      store,
      mockFetch
    );
    expect(res.cached).toBe(2);
    expect(res.errors).toHaveLength(0);
    expect(res.linkedInSearchUrl).toContain("linkedin.com/jobs/search");
    expect(res.linkedInSearchUrl).toContain("accountant");
    expect(store.loadJobs()).toHaveLength(2);
    // full description cached even though tool output is trimmed
    expect(store.getJob("remotive-1")!.description).toContain("typescript");
  });

  it("survives one source failing", async () => {
    const store = tmpJobStore();
    const failingFetch = (async (url: string) => {
      if (String(url).includes("remotive")) return new Response("nope", { status: 500 });
      return mockFetch(url as any);
    }) as typeof fetch;
    const res = await runScanJobs(
      { query: "accountant", sources: ["remotive", "remoteok"], limit: 10 },
      store,
      failingFetch
    );
    expect(res.cached).toBe(1);
    expect(res.errors.length).toBe(1);
  });
});

describe("buildLinkedInJobSearchUrl", () => {
  it("builds a filtered linkedin.com URL (no scraping)", () => {
    const url = buildLinkedInJobSearchUrl({ keywords: "ai engineer", senior: true });
    expect(url).toContain("https://www.linkedin.com/jobs/search/?");
    expect(url).toContain("f_WT=2");
    expect(url).toContain("f_E=4");
  });
});

describe("rank_job_fit", () => {
  it("scores a matching job higher than a non-matching one", () => {
    const good = scoreJob(goodJob, profile);
    const bad = scoreJob(badJob, profile);
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.matched.length).toBeGreaterThan(0);
    expect(good.titleMatch).toBe(true);
    expect(bad.titleMatch).toBe(false);
  });

  it("ranks all cached jobs sorted by score with minScore filter", () => {
    const store = tmpJobStore();
    store.saveJobs([goodJob, badJob]);
    const res = runRankJobFit({ minScore: 0, top: 10 }, profile, store);
    expect(res.totalCached).toBe(2);
    expect(res.ranked[0].jobId).toBe("remotive-1");
    const high = runRankJobFit({ minScore: res.ranked[0].score, top: 10 }, profile, store);
    expect(high.ranked).toHaveLength(1);
  });

  it("throws for unknown jobId", () => {
    const store = tmpJobStore();
    expect(() => runRankJobFit({ jobId: "nope", minScore: 0, top: 5 }, profile, store)).toThrow();
  });
});

describe("prepare_application", () => {
  it("builds talking points from REAL experience, a cover note, and never auto-applies", () => {
    const store = tmpJobStore();
    store.saveJobs([goodJob]);
    const res = runPrepareApplication({ jobId: "remotive-1", tone: "direct" }, profile, store);
    expect(res.fitScore).toBeGreaterThan(0);
    expect(res.coverNote).toContain("AgentCo");
    expect(res.talkingPoints.length).toBeGreaterThan(0);
    expect(res.applyInstructions).toContain("YOURSELF");
    expect(res.applyInstructions).toContain("never auto-submits");
    // tracker entry created as 'preparing'
    const apps = store.loadApplications();
    expect(apps).toHaveLength(1);
    expect(apps[0].status).toBe("preparing");
  });

  it("includes extraContext in the cover note", () => {
    const store = tmpJobStore();
    store.saveJobs([goodJob]);
    const res = runPrepareApplication(
      { jobId: "remotive-1", tone: "warm", extraContext: "Available from August, US-based." },
      profile,
      store
    );
    expect(res.coverNote).toContain("Available from August");
  });
});

describe("track_applications", () => {
  it("updates status and lists with counts + follow-ups", () => {
    const store = tmpJobStore();
    store.saveJobs([goodJob]);
    runPrepareApplication({ jobId: "remotive-1", tone: "direct" }, profile, store);

    const upd = runTrackApplications(
      { action: "update", jobId: "remotive-1", status: "applied", notes: "sent", followUpAt: "2020-01-01" },
      store
    ) as any;
    expect(upd.updated.status).toBe("applied");
    expect(upd.updated.appliedAt).toBeTruthy();

    const list = runTrackApplications({ action: "list" }, store) as any;
    expect(list.total).toBe(1);
    expect(list.byStatus.applied).toBe(1);
    expect(list.followUpsDue).toHaveLength(1); // 2020 date is overdue
  });
});
