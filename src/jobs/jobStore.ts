/**
 * Local job cache + application tracker. Plain JSON under dataDir.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Job, JobSchema } from "./jobSources.js";

export const ApplicationStatusEnum = z.enum([
  "interested",
  "preparing",
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
]);
export type ApplicationStatus = z.infer<typeof ApplicationStatusEnum>;

export const ApplicationSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  company: z.string(),
  url: z.string(),
  status: ApplicationStatusEnum.default("interested"),
  notes: z.string().default(""),
  appliedAt: z.string().optional(),
  followUpAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Application = z.infer<typeof ApplicationSchema>;

export class JobStore {
  constructor(private dataDir: string) {}

  private file(name: string): string {
    fs.mkdirSync(this.dataDir, { recursive: true });
    return path.join(this.dataDir, name);
  }

  saveJobs(jobs: Job[]): string {
    // merge with existing cache by id
    const existing = this.loadJobs();
    const byId = new Map(existing.map((j) => [j.id, j]));
    for (const j of jobs) byId.set(j.id, j);
    const p = this.file("jobs-cache.json");
    fs.writeFileSync(p, JSON.stringify([...byId.values()], null, 2), "utf8");
    return p;
  }

  loadJobs(): Job[] {
    const p = this.file("jobs-cache.json");
    if (!fs.existsSync(p)) return [];
    return z.array(JobSchema).parse(JSON.parse(fs.readFileSync(p, "utf8")));
  }

  getJob(id: string): Job | undefined {
    return this.loadJobs().find((j) => j.id === id);
  }

  loadApplications(): Application[] {
    const p = this.file("applications.json");
    if (!fs.existsSync(p)) return [];
    return z.array(ApplicationSchema).parse(JSON.parse(fs.readFileSync(p, "utf8")));
  }

  saveApplications(apps: Application[]): void {
    fs.writeFileSync(this.file("applications.json"), JSON.stringify(apps, null, 2), "utf8");
  }

  upsertApplication(
    input: Partial<Application> & { jobId: string }
  ): Application {
    const apps = this.loadApplications();
    const now = new Date().toISOString();
    const idx = apps.findIndex((a) => a.jobId === input.jobId);
    if (idx >= 0) {
      const merged = ApplicationSchema.parse({ ...apps[idx], ...input, updatedAt: now });
      if (input.status === "applied" && !merged.appliedAt) merged.appliedAt = now;
      apps[idx] = merged;
      this.saveApplications(apps);
      return merged;
    }
    const job = this.getJob(input.jobId);
    const created = ApplicationSchema.parse({
      title: job?.title ?? input.title ?? "(unknown)",
      company: job?.company ?? input.company ?? "(unknown)",
      url: job?.url ?? input.url ?? "",
      ...input,
      createdAt: now,
      updatedAt: now,
      ...(input.status === "applied" ? { appliedAt: now } : {}),
    });
    apps.push(created);
    this.saveApplications(apps);
    return created;
  }
}
