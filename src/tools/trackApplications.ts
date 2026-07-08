/**
 * track_applications — local application tracker (list/update).
 */
import { z } from "zod";
import { ApplicationStatusEnum, JobStore } from "../jobs/jobStore.js";

export const TrackApplicationsInput = z.object({
  action: z.enum(["list", "update"]).default("list"),
  jobId: z.string().optional().describe("Required for update."),
  status: ApplicationStatusEnum.optional(),
  notes: z.string().optional(),
  followUpAt: z.string().optional().describe("ISO date for a follow-up reminder, e.g. '2026-07-14'"),
});

export function runTrackApplications(
  args: z.infer<typeof TrackApplicationsInput>,
  store: JobStore
) {
  if (args.action === "update") {
    if (!args.jobId) throw new Error("update requires jobId");
    const app = store.upsertApplication({
      jobId: args.jobId,
      ...(args.status ? { status: args.status } : {}),
      ...(args.notes !== undefined ? { notes: args.notes } : {}),
      ...(args.followUpAt ? { followUpAt: args.followUpAt } : {}),
    });
    return { updated: app };
  }

  const apps = store.loadApplications().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const byStatus: Record<string, number> = {};
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
  const due = apps.filter((a) => a.followUpAt && a.followUpAt <= new Date().toISOString().slice(0, 10));
  return {
    total: apps.length,
    byStatus,
    followUpsDue: due.map((a) => ({ jobId: a.jobId, company: a.company, followUpAt: a.followUpAt })),
    applications: apps,
  };
}
