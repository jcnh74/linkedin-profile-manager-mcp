/**
 * Job sources — ONLY legitimate, public, keyless job APIs.
 *
 *  - Remotive  (https://remotive.com/api/remote-jobs) — public API, remote jobs
 *  - RemoteOK  (https://remoteok.com/api)             — public API (attribution required)
 *
 * Deliberately NOT included: LinkedIn job scraping (no public API; scraping
 * violates their User Agreement). For LinkedIn we generate a pre-filtered
 * search URL the user opens manually — see buildLinkedInJobSearchUrl().
 */
import { z } from "zod";

export const JobSchema = z.object({
  id: z.string(),
  source: z.enum(["remotive", "remoteok", "manual"]),
  title: z.string(),
  company: z.string(),
  location: z.string().default("Remote"),
  url: z.string(),
  description: z.string().default(""),
  tags: z.array(z.string()).default([]),
  salary: z.string().optional(),
  postedAt: z.string().optional(),
});
export type Job = z.infer<typeof JobSchema>;

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export async function fetchRemotive(
  query: string,
  limit: number,
  fetchImpl: FetchLike = fetch
): Promise<Job[]> {
  const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(query)}&limit=${limit}`;
  const res = await fetchImpl(url, { headers: { "User-Agent": "linkedin-profile-manager-mcp" } });
  if (!res.ok) throw new Error(`Remotive: ${res.status}`);
  const data = (await res.json()) as { jobs?: any[] };
  return (data.jobs ?? []).map((j) =>
    JobSchema.parse({
      id: `remotive-${j.id}`,
      source: "remotive",
      title: j.title ?? "",
      company: j.company_name ?? "",
      location: j.candidate_required_location || "Remote",
      url: j.url ?? "",
      description: stripHtml(String(j.description ?? "")).slice(0, 4000),
      tags: Array.isArray(j.tags) ? j.tags : [],
      salary: j.salary || undefined,
      postedAt: j.publication_date || undefined,
    })
  );
}

export async function fetchRemoteOK(
  query: string,
  limit: number,
  fetchImpl: FetchLike = fetch
): Promise<Job[]> {
  const res = await fetchImpl("https://remoteok.com/api", {
    headers: { "User-Agent": "linkedin-profile-manager-mcp" },
  });
  if (!res.ok) throw new Error(`RemoteOK: ${res.status}`);
  const data = (await res.json()) as any[];
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  return data
    .filter((j) => j && j.id && j.position) // first element is a legal notice
    .filter((j) => {
      const hay = `${j.position} ${j.company} ${(j.tags ?? []).join(" ")} ${j.description ?? ""}`.toLowerCase();
      return q.length === 0 || q.some((w) => hay.includes(w));
    })
    .slice(0, limit)
    .map((j) =>
      JobSchema.parse({
        id: `remoteok-${j.id}`,
        source: "remoteok",
        title: j.position ?? "",
        company: j.company ?? "",
        location: j.location || "Remote",
        url: j.url ?? `https://remoteok.com/remote-jobs/${j.id}`,
        description: stripHtml(String(j.description ?? "")).slice(0, 4000),
        tags: Array.isArray(j.tags) ? j.tags : [],
        salary:
          j.salary_min && j.salary_max ? `$${j.salary_min}-$${j.salary_max}` : undefined,
        postedAt: j.date || undefined,
      })
    );
}

/**
 * LinkedIn job search: we do NOT scrape. We build the filtered search URL
 * for the user to open in their browser.
 *  f_WT=2 → remote; f_TPR=r604800 → past week; f_E=4 → senior level
 */
export function buildLinkedInJobSearchUrl(opts: {
  keywords: string;
  remoteOnly?: boolean;
  pastWeek?: boolean;
  senior?: boolean;
}): string {
  const params = new URLSearchParams({ keywords: opts.keywords });
  if (opts.remoteOnly !== false) params.set("f_WT", "2");
  if (opts.pastWeek !== false) params.set("f_TPR", "r604800");
  if (opts.senior) params.set("f_E", "4");
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}
