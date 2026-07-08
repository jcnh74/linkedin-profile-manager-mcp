#!/usr/bin/env node
/**
 * job-scan.mjs — standalone daily job-scan watchdog.
 *
 * Fetches jobs from public APIs (Remotive, RemoteOK), scores them against
 * your saved profile snapshot, and prints NEW jobs at/above MIN_SCORE.
 * Prints NOTHING when there are no new hits (watchdog pattern — wire it to
 * cron/launchd/Hermes and silence means "no news").
 *
 * Usage:
 *   npm run build && node scripts/job-scan.mjs [minScore] [query...]
 *   node scripts/job-scan.mjs 60 "senior full stack engineer" "ai agents"
 *
 * Config via env:
 *   JOB_SCAN_DATA_DIR   defaults to ~/.linkedin-profile-manager
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const { fetchRemotive, fetchRemoteOK, buildLinkedInJobSearchUrl } = await import(
  path.join(DIST, "jobs/jobSources.js")
);
const { scoreJob } = await import(path.join(DIST, "tools/rankJobFit.js"));

const [, , scoreArg, ...queryArgs] = process.argv;
const MIN_SCORE = Number(scoreArg) || 60;
const QUERIES = queryArgs.length
  ? queryArgs
  : ["senior full stack engineer", "ai agent engineer", "ai automation"];

const DATA = process.env.JOB_SCAN_DATA_DIR || path.join(os.homedir(), ".linkedin-profile-manager");
const SEEN_FILE = path.join(DATA, "cron-seen-jobs.json");
const SNAPSHOT = path.join(DATA, "profile-snapshot.json");

if (!fs.existsSync(SNAPSHOT)) {
  console.error(
    "No profile snapshot found. Capture one first via the get_profile_snapshot MCP tool " +
      `(expected at ${SNAPSHOT}).`
  );
  process.exit(1);
}
const profile = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
const seen = new Set(fs.existsSync(SEEN_FILE) ? JSON.parse(fs.readFileSync(SEEN_FILE, "utf8")) : []);

const jobs = new Map();
const errors = [];
for (const q of QUERIES) {
  const settled = await Promise.allSettled([fetchRemotive(q, 25), fetchRemoteOK(q, 25)]);
  for (const s of settled) {
    if (s.status === "fulfilled") for (const j of s.value) jobs.set(j.id, j);
    else errors.push(String(s.reason).slice(0, 120));
  }
}

const hits = [...jobs.values()]
  .filter((j) => !seen.has(j.id))
  .map((j) => ({ j, fit: scoreJob(j, profile) }))
  .filter(({ fit }) => fit.score >= MIN_SCORE)
  .sort((a, b) => b.fit.score - a.fit.score)
  .slice(0, 8);

fs.mkdirSync(DATA, { recursive: true });
fs.writeFileSync(SEEN_FILE, JSON.stringify([...seen, ...jobs.keys()].slice(-3000)));

if (hits.length === 0) {
  // All sources down = alert; otherwise stay silent (no news).
  if (errors.length === 2 * QUERIES.length) {
    console.log(`⚠️ Job scan: all API calls failed.\n${[...new Set(errors)].join("\n")}`);
  }
  process.exit(0);
}

const lines = [`🎯 ${hits.length} new job${hits.length > 1 ? "s" : ""} matching your profile (fit ≥ ${MIN_SCORE}):`, ""];
for (const { j, fit } of hits) {
  lines.push(`${fit.score}/100 — ${j.title} @ ${j.company}${j.salary ? ` (${j.salary})` : ""}`);
  lines.push(`   ${j.url}`);
  if (fit.matched.length) lines.push(`   matches: ${fit.matched.slice(0, 5).join(", ")}`);
  lines.push("");
}
lines.push(`LinkedIn (browse manually): ${buildLinkedInJobSearchUrl({ keywords: QUERIES[0], senior: true })}`);
lines.push(`\nApplying stays manual — use prepare_application for talking points + a cover note.`);
console.log(lines.join("\n"));
