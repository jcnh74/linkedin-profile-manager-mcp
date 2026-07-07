/**
 * Local profile store. Snapshots + patches live under config.dataDir.
 * Everything is plain JSON/Markdown on the user's disk. Nothing leaves the machine.
 */
import fs from "node:fs";
import path from "node:path";
import { Profile, ProfileSchema } from "../types.js";

export class LocalProfileStore {
  constructor(private dataDir: string) {}

  private ensureDir(sub?: string): string {
    const dir = sub ? path.join(this.dataDir, sub) : this.dataDir;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private snapshotPath(): string {
    return path.join(this.ensureDir(), "profile-snapshot.json");
  }

  saveSnapshot(profile: Profile): string {
    const p = this.snapshotPath();
    fs.writeFileSync(p, JSON.stringify(profile, null, 2), "utf8");
    return p;
  }

  loadSnapshot(): Profile | null {
    const p = this.snapshotPath();
    if (!fs.existsSync(p)) return null;
    return ProfileSchema.parse(JSON.parse(fs.readFileSync(p, "utf8")));
  }

  /** Write an export file (markdown or json) into dataDir/exports/. Returns path. */
  writeExport(filename: string, content: string): string {
    const dir = this.ensureDir("exports");
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const p = path.join(dir, safe);
    fs.writeFileSync(p, content, "utf8");
    return p;
  }
}

/**
 * Best-effort parser for pasted LinkedIn profile text (or text extracted from
 * the LinkedIn "Save to PDF" export). Heuristic; the user can always supply
 * structured JSON instead.
 */
export function parseProfileText(text: string): Profile {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const profile: Profile = ProfileSchema.parse({ rawText: text });

  const sectionHeaders = [
    "about",
    "summary",
    "experience",
    "education",
    "skills",
    "top skills",
    "featured",
    "licenses & certifications",
    "honors & awards",
    "languages",
    "contact",
  ];
  const isHeader = (l: string) => sectionHeaders.includes(l.toLowerCase());

  let section = "header";
  const buckets: Record<string, string[]> = { header: [] };
  for (const line of lines) {
    if (isHeader(line)) {
      section = line.toLowerCase().replace("summary", "about").replace("top skills", "skills");
      buckets[section] ??= [];
      continue;
    }
    (buckets[section] ??= []).push(line);
  }

  const header = buckets["header"] ?? [];
  if (header.length > 0) profile.name = header[0];
  if (header.length > 1) profile.headline = header[1];

  if (buckets["about"]) profile.about = buckets["about"].join("\n");

  if (buckets["skills"]) {
    profile.skills = buckets["skills"]
      .flatMap((l) => l.split(/[,·•]/))
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (buckets["experience"]) {
    // Heuristic: pairs of lines "Title" / "Company · dates", bullets start with -,•,*
    const exp = buckets["experience"];
    let current: { title: string; company: string; bullets: string[] } | null = null;
    for (const line of exp) {
      const bullet = line.match(/^[-•*]\s*(.+)/);
      if (bullet && current) {
        current.bullets.push(bullet[1]);
      } else if (!current) {
        current = { title: line, company: "", bullets: [] };
      } else if (current.company === "") {
        current.company = line.split("·")[0].trim();
      } else {
        profile.experience.push({ ...current, bullets: current.bullets });
        current = { title: line, company: "", bullets: [] };
      }
    }
    if (current) profile.experience.push({ ...current, bullets: current.bullets });
  }

  return profile;
}
