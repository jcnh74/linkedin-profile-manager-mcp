#!/usr/bin/env node
/**
 * linkedin-profile-manager-mcp
 * Local-first MCP server for safely managing your personal LinkedIn profile.
 *
 * Safety posture:
 *  - No scraping, no browser automation (only OS-level "open URL").
 *  - No credential storage. Optional OAuth token via env var, official API only.
 *  - All side-effecting tools use a two-step human-in-the-loop approval flow.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadConfig } from "./config.js";
import { LocalProfileStore } from "./storage/localProfileStore.js";
import { riskBanner } from "./safety/riskLabels.js";
import { TargetRoleEnum } from "./types.js";

import { GetProfileSnapshotInput, runGetProfileSnapshot } from "./tools/getProfileSnapshot.js";
import { runAuditProfile } from "./tools/auditProfile.js";
import { runGenerateHeadlineVariants } from "./tools/generateHeadlineVariants.js";
import { AboutStyleEnum, runRewriteAbout } from "./tools/rewriteAbout.js";
import { RewriteExperienceInput, runRewriteExperience } from "./tools/rewriteExperience.js";
import { runKeywordGapAnalysis } from "./tools/keywordGapAnalysis.js";
import { ProposedChangeInput, runGenerateUpdatePlan, UpdatePlan } from "./tools/generateUpdatePlan.js";
import { runExportProfilePatch } from "./tools/exportProfilePatch.js";
import { CreateLinkedInPostInput, runCreateLinkedInPost } from "./tools/createLinkedInPost.js";
import { OpenEditPageInput, runOpenEditPage } from "./tools/openEditPage.js";
import { JobStore } from "./jobs/jobStore.js";
import { ScanJobsInput, runScanJobs } from "./tools/scanJobs.js";
import { RankJobFitInput, runRankJobFit } from "./tools/rankJobFit.js";
import { PrepareApplicationInput, runPrepareApplication } from "./tools/prepareApplication.js";
import { TrackApplicationsInput, runTrackApplications } from "./tools/trackApplications.js";

const config = loadConfig();
const store = new LocalProfileStore(config.dataDir);
const jobStore = new JobStore(config.dataDir);

/** Keep the last generated plan in memory so export can reuse it. */
let lastPlan: UpdatePlan | null = null;

const server = new McpServer({
  name: "linkedin-profile-manager",
  version: "0.1.0",
});

function jsonResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}
function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function requireSnapshot() {
  const p = store.loadSnapshot();
  if (!p) {
    throw new Error(
      "No profile snapshot found. First call get_profile_snapshot with your pasted profile text, PDF text, or JSON."
    );
  }
  return p;
}

// ── 1. get_profile_snapshot ────────────────────────────────────────────────
server.registerTool(
  "get_profile_snapshot",
  {
    title: "Get profile snapshot",
    description: `${riskBanner("local-write")} Ingest your current LinkedIn profile from pasted text, exported PDF text, or structured JSON. No scraping; you provide the data.`,
    inputSchema: GetProfileSnapshotInput.shape,
  },
  async (args) => jsonResult(runGetProfileSnapshot(GetProfileSnapshotInput.parse(args), store, config))
);

// ── 2. audit_profile ───────────────────────────────────────────────────────
server.registerTool(
  "audit_profile",
  {
    title: "Audit profile",
    description: `${riskBanner("read-only")} Score the saved profile snapshot for recruiter searchability, clarity, credibility, AI/engineering positioning, and conversion.`,
    inputSchema: { targetRole: TargetRoleEnum.default("agentic-ai-systems-engineer") },
  },
  async (args) => jsonResult(runAuditProfile(requireSnapshot(), TargetRoleEnum.parse(args.targetRole ?? "agentic-ai-systems-engineer")))
);

// ── 3. generate_headline_variants ─────────────────────────────────────────
server.registerTool(
  "generate_headline_variants",
  {
    title: "Generate headline variants",
    description: `${riskBanner("draft-only")} Generate LinkedIn headline options (max 220 chars) for a target role.`,
    inputSchema: {
      targetRole: TargetRoleEnum,
      count: z.number().int().min(1).max(8).default(5),
    },
  },
  async (args) =>
    jsonResult(
      runGenerateHeadlineVariants(
        store.loadSnapshot() ?? { headline: "", about: "", experience: [], skills: [], featuredLinks: [], education: [] },
        TargetRoleEnum.parse(args.targetRole),
        Number(args.count ?? 5)
      )
    )
);

// ── 4. rewrite_about_section ───────────────────────────────────────────────
server.registerTool(
  "rewrite_about_section",
  {
    title: "Rewrite About section",
    description: `${riskBanner("draft-only")} Produce polished About section variants: concise, technical, founder-consultant, recruiter-friendly, ai-forward.`,
    inputSchema: {
      styles: z.array(AboutStyleEnum).default(["concise", "technical", "ai-forward"]),
      extraContext: z.string().optional(),
    },
  },
  async (args) =>
    jsonResult(
      runRewriteAbout(
        requireSnapshot(),
        z.array(AboutStyleEnum).parse(args.styles ?? ["concise", "technical", "ai-forward"]),
        args.extraContext as string | undefined
      )
    )
);

// ── 5. rewrite_experience ──────────────────────────────────────────────────
server.registerTool(
  "rewrite_experience",
  {
    title: "Rewrite experience bullets",
    description: `${riskBanner("draft-only")} Rewrite job experience bullets with strong verbs, technical keywords, and measurable impact. Never invents metrics — supply knownMetrics.`,
    inputSchema: RewriteExperienceInput.shape,
  },
  async (args) => {
    const a = RewriteExperienceInput.parse(args);
    return jsonResult(runRewriteExperience(a.experience, a.targetKeywords, a.knownMetrics));
  }
);

// ── 6. keyword_gap_analysis ────────────────────────────────────────────────
server.registerTool(
  "keyword_gap_analysis",
  {
    title: "Keyword gap analysis",
    description: `${riskBanner("read-only")} Compare the saved profile against target job descriptions (or a role keyword bank) and recommend missing keywords + natural placement.`,
    inputSchema: {
      jobDescriptions: z.array(z.string()).default([]),
      targetRole: TargetRoleEnum.optional(),
    },
  },
  async (args) =>
    jsonResult(
      runKeywordGapAnalysis(
        requireSnapshot(),
        z.array(z.string()).parse(args.jobDescriptions ?? []),
        args.targetRole ? TargetRoleEnum.parse(args.targetRole) : undefined
      )
    )
);

// ── 7. generate_update_plan ────────────────────────────────────────────────
server.registerTool(
  "generate_update_plan",
  {
    title: "Generate manual update plan",
    description: `${riskBanner("draft-only")} Build a step-by-step MANUAL LinkedIn editing plan: field, edit URL, old text, new text, rationale. You apply changes by hand.`,
    inputSchema: { changes: z.array(ProposedChangeInput).min(1) },
  },
  async (args) => {
    const changes = z.array(ProposedChangeInput).min(1).parse(args.changes);
    lastPlan = runGenerateUpdatePlan(
      changes.map((c) => ({ field: c.field, newText: c.newText, rationale: c.rationale ?? "" })),
      store.loadSnapshot()
    );
    return jsonResult(lastPlan);
  }
);

// ── 8. export_profile_patch ────────────────────────────────────────────────
server.registerTool(
  "export_profile_patch",
  {
    title: "Export profile patch",
    description: `${riskBanner("local-write")} Save the most recent update plan as local Markdown + JSON files. Never pushes anywhere.`,
    inputSchema: { name: z.string().default("profile-patch") },
  },
  async (args) => {
    if (!lastPlan) {
      return textResult("No update plan in memory. Run generate_update_plan first.");
    }
    const res = runExportProfilePatch(lastPlan, String(args.name ?? "profile-patch"), store);
    return jsonResult({ ...res, note: "Files written locally. Apply changes manually via the plan." });
  }
);

// ── 9. create_linkedin_post ────────────────────────────────────────────────
server.registerTool(
  "create_linkedin_post",
  {
    title: "Create LinkedIn post (draft-first)",
    description: `${riskBanner("publishes-content")} Draft a post. Publishing requires: preview call → human approval → confirm=true with approvalToken, AND official OAuth (LINKEDIN_ACCESS_TOKEN, w_member_social) AND enableOfficialPosting=true in config.`,
    inputSchema: CreateLinkedInPostInput.shape,
  },
  async (args) => jsonResult(await runCreateLinkedInPost(CreateLinkedInPostInput.parse(args), config))
);

// ── 10. open_edit_page ─────────────────────────────────────────────────────
server.registerTool(
  "open_edit_page",
  {
    title: "Open LinkedIn edit page",
    description: `${riskBanner("opens-browser")} Open a LinkedIn profile edit URL in your default browser for MANUAL editing. Two-step confirmation; no clicks, no auto-save.`,
    inputSchema: OpenEditPageInput.shape,
  },
  async (args) => jsonResult(runOpenEditPage(OpenEditPageInput.parse(args)))
);

// ── 11. scan_jobs ──────────────────────────────────────────────────────────
server.registerTool(
  "scan_jobs",
  {
    title: "Scan jobs (public APIs)",
    description: `${riskBanner("local-write")} Fetch jobs matching a query from legitimate public job APIs (Remotive, RemoteOK) and cache them locally. Also returns a pre-filtered LinkedIn job-search URL for manual browsing — LinkedIn listings are never scraped.`,
    inputSchema: ScanJobsInput.shape,
  },
  async (args) => jsonResult(await runScanJobs(ScanJobsInput.parse(args), jobStore))
);

// ── 12. rank_job_fit ───────────────────────────────────────────────────────
server.registerTool(
  "rank_job_fit",
  {
    title: "Rank job fit",
    description: `${riskBanner("read-only")} Score cached jobs against your profile snapshot (keyword overlap + title affinity, 0-100) so you focus on high-fit roles.`,
    inputSchema: RankJobFitInput.shape,
  },
  async (args) => {
    const a = RankJobFitInput.parse(args);
    return jsonResult(runRankJobFit({ jobId: a.jobId, minScore: a.minScore, top: a.top }, requireSnapshot(), jobStore));
  }
);

// ── 13. prepare_application ────────────────────────────────────────────────
server.registerTool(
  "prepare_application",
  {
    title: "Prepare application (never auto-applies)",
    description: `${riskBanner("draft-only")} For a cached job: fit summary, tailored talking points from your REAL experience, a cover note draft, and the apply URL. YOU open the URL and submit — this server never auto-applies.`,
    inputSchema: PrepareApplicationInput.shape,
  },
  async (args) =>
    jsonResult(runPrepareApplication(PrepareApplicationInput.parse(args), requireSnapshot(), jobStore))
);

// ── 14. track_applications ─────────────────────────────────────────────────
server.registerTool(
  "track_applications",
  {
    title: "Track applications",
    description: `${riskBanner("local-write")} Local application tracker: list all applications (with status counts + due follow-ups) or update one (status, notes, followUpAt).`,
    inputSchema: TrackApplicationsInput.shape,
  },
  async (args) => jsonResult(runTrackApplications(TrackApplicationsInput.parse(args), jobStore))
);

// ── start ──────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("linkedin-profile-manager-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
