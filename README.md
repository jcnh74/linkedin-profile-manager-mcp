# linkedin-profile-manager-mcp

![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen) ![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue) ![MCP](https://img.shields.io/badge/MCP-stdio-purple) ![Tests](https://img.shields.io/badge/tests-39%20passing-brightgreen) ![License](https://img.shields.io/badge/license-MIT-yellow)

**Local-first MCP server for managing and improving your personal LinkedIn profile — safely.**

This server drafts, audits, compares, and plans profile updates. It deliberately does **not** automate LinkedIn itself:

- ❌ No scraping, no headless browsers, no anti-detection tricks
- ❌ No LinkedIn credentials or session cookies — ever
- ❌ No auto-clicking "Save" or auto-submitting profile edits
- ✅ Human-in-the-loop approval (two-step token flow) for anything with a side effect
- ✅ Official LinkedIn API only, and only for the one thing it actually supports for members: **posting** (OAuth + `w_member_social`), gated behind explicit config + per-post confirmation
- ✅ For everything else (headline, About, experience, skills): generates polished drafts and a manual copy/paste plan with the exact LinkedIn edit URLs

> **Why no profile-edit automation?** LinkedIn's public developer platform has no self-serve API for editing headline/About/experience/skills on personal profiles, and browser automation of those edits violates LinkedIn's User Agreement (§8.2 prohibits bots/scrapers/automation) and risks account restriction. Drafting locally + pasting manually is the only compliant workflow — so that's the workflow this server optimizes.

## Why not an existing LinkedIn MCP server?

Before building this, five existing servers were evaluated (July 2026):

| Project | Stars | Maintained | Transport | Method | Profile editing |
|---|---:|---|---|---|---|
| [stickerdaniel/linkedin-mcp-server](https://github.com/stickerdaniel/linkedin-mcp-server) | ~2.7k | ✅ active | stdio/HTTP | Browser-session **scraping** (your logged-in cookie) | ❌ read-only |
| [eliasbiondo/linkedin-mcp-server](https://github.com/eliasbiondo/linkedin-mcp-server) | ~156 | ⚠️ sporadic | stdio | **Patchright** (anti-detection Playwright fork) scraping | ❌ read-only |
| [felipfr/linkedin-mcpserver](https://github.com/felipfr/linkedin-mcpserver) | ~74 | ❌ dead (Mar 2025) | stdio | Unofficial REST + stored credentials | ❌ search/message |
| [fredericbarthelet/linkedin-mcp-server](https://github.com/fredericbarthelet/linkedin-mcp-server) | ~38 | ❌ dead (Mar 2025) | SSE | ✅ Official Community Management API (OAuth) | ❌ post only |
| [pegasusheavy → quinnjr/linkedin-mcp](https://github.com/quinnjr/linkedin-mcp) | ~34 | ✅ active | stdio | Official OAuth/OIDC | ⚠️ advertises 18 profile-edit tools against endpoints LinkedIn doesn't grant to self-serve apps |

Conclusions that shaped this project:

- The **popular** options are scraping-based — they operate your logged-in session with automation LinkedIn's User Agreement prohibits, and some use anti-detection tooling. That's account risk by design.
- The **official-API** options are either unmaintained or claim member profile-edit capabilities the public API doesn't actually offer.
- The only compliant, durable design is the one implemented here: **you provide the profile data, the server does the intelligence locally, publishing goes through the official API only, and profile edits are prepared for manual application.**

## Tools

| Tool | Risk level | What it does |
|---|---|---|
| `get_profile_snapshot` | local-write | Ingest your profile from pasted text, LinkedIn "Save to PDF" text, or JSON. Saved locally. |
| `audit_profile` | read-only | Scores: recruiter searchability, clarity, credibility, AI/engineering positioning, conversion. |
| `generate_headline_variants` | draft-only | Headline options (≤220 chars) for Senior Full Stack Engineer, Agentic AI Systems Engineer, AI Automation Consultant, React/Python/PHP Engineer. |
| `rewrite_about_section` | draft-only | About variants: concise, technical, founder-consultant, recruiter-friendly, ai-forward (≤2600 chars). |
| `rewrite_experience` | draft-only | Rewrites bullets: strong verbs, keywords, metric slots. **Never invents metrics** — you supply `knownMetrics`. |
| `keyword_gap_analysis` | read-only | Compares profile vs. target job descriptions; recommends missing keywords + natural placement. |
| `generate_update_plan` | draft-only | Step-by-step manual edit plan: field, edit URL, old text, new text, rationale. |
| `export_profile_patch` | local-write | Saves the plan as Markdown + JSON under `~/.linkedin-profile-manager/exports/`. Never pushes. |
| `create_linkedin_post` | publishes-content ⚠️ | Draft-first. Publishing requires preview→approval-token→confirm AND official OAuth AND `enableOfficialPosting: true`. |
| `open_edit_page` | opens-browser ⚠️ | Opens a `linkedin.com` edit URL in your default browser (OS `open` only). You edit and save by hand. |
| `scan_jobs` | local-write | Fetch matching jobs from **public job APIs** (Remotive, RemoteOK) and cache them locally. Also returns a pre-filtered LinkedIn job-search URL for manual browsing — LinkedIn listings are never scraped. |
| `rank_job_fit` | read-only | Score cached jobs against your profile snapshot (keyword overlap + title affinity, 0–100). |
| `prepare_application` | draft-only | For a chosen job: fit summary, talking points from your **real** experience, cover note draft, and the apply URL. **You** open it and submit — never auto-applies. |
| `track_applications` | local-write | Local application tracker: statuses, notes, follow-up dates, overdue follow-ups. |

### Job-hunting workflow (scan → rank → prepare → you apply)

```
scan_jobs("senior full stack ai agents")     # public APIs + LinkedIn search URL
rank_job_fit(minScore: 50)                   # fit-scored shortlist
prepare_application(jobId: "remotive-123")   # talking points + cover note + apply URL
→ you open the URL, personalize, click Apply
track_applications(update: applied)          # local tracker with follow-up reminders
```

**Why no auto-apply?** There is no official API for member job applications, and automating Easy Apply through your browser session is both against LinkedIn's User Agreement and one of the most aggressively detected bot behaviors on the platform. The server automates everything up to the click; the click is yours.

## Requirements

- Node.js ≥ 20
- An MCP client (Claude Desktop, Claude Code, MCP Inspector, …)

## Install

```bash
git clone <your-fork-url> linkedin-profile-manager-mcp
cd linkedin-profile-manager-mcp
npm install
npm run build
npm test        # 30 tests
npm run smoke   # boots the server on stdio and lists the 10 tools
```

## Claude Desktop setup

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "linkedin-profile-manager": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/linkedin-profile-manager-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. The 10 tools appear under the 🔌 icon.

## Claude Code setup

```bash
claude mcp add linkedin-profile-manager -- node /ABSOLUTE/PATH/TO/linkedin-profile-manager-mcp/dist/index.js
```

## Configuration (optional)

Config is looked up at `$LINKEDIN_MCP_CONFIG`, then `./linkedin-mcp.config.json`, then `~/.linkedin-profile-manager/config.json`:

```json
{
  "dataDir": "/Users/you/.linkedin-profile-manager",
  "profileSlug": "your-linkedin-slug",
  "enableOfficialPosting": false
}
```

The config loader **refuses to start** if it finds credential-like keys (`password`, `li_at`, `cookie`, …) in the file.

### Optional: official posting (OAuth)

Only needed if you want `create_linkedin_post` to actually publish (instead of just drafting):

1. Create an app at <https://www.linkedin.com/developers/> and add the **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect** products.
2. Complete the OAuth 2.0 authorization-code flow to obtain a member access token with scopes `openid profile w_member_social` (the [LinkedIn token generator tool](https://www.linkedin.com/developers/tools/oauth) works for personal use).
3. Provide the token via environment only — never in the config file:

```json
{
  "mcpServers": {
    "linkedin-profile-manager": {
      "command": "node",
      "args": ["/ABS/PATH/dist/index.js"],
      "env": { "LINKEDIN_ACCESS_TOKEN": "AQV..." }
    }
  }
}
```

4. Set `"enableOfficialPosting": true` in your config file.
5. Even then, every post requires the two-step preview → approval-token → confirm flow.

## Typical workflow

1. Open your profile → "Save to PDF" (or select-all/copy the page text).
2. `get_profile_snapshot` with the text.
3. `audit_profile` → see scores + findings.
4. `keyword_gap_analysis` with 1–3 job descriptions you're targeting.
5. `generate_headline_variants` / `rewrite_about_section` / `rewrite_experience` → pick your favorites.
6. `generate_update_plan` with the chosen changes → get old/new/rationale per field.
7. `export_profile_patch` → keep a local Markdown record.
8. `open_edit_page` per section → paste, review, click **Save** yourself.

## Example prompts

- *"Take this pasted LinkedIn profile and audit it for an Agentic AI Systems Engineer role."*
- *"Generate 5 headline variants for AI Automation Consultant, then compare them against my current headline."*
- *"Here are two job descriptions I want. Run a keyword gap analysis and tell me where to put the missing terms."*
- *"Rewrite my Acme Corp experience bullets. Real metrics: cut deploy time 40min→6min, portal served 40k users."*
- *"Build an update plan for the headline + About changes we agreed on, export it, and open the headline edit page."*
- *"Draft a LinkedIn post about shipping an MCP server. Don't publish — just draft."*

## Safety notes

- **ToS compliance**: LinkedIn's User Agreement prohibits scraping and automation of the site. This project touches LinkedIn servers only through the official, versioned REST API, and only for posting, and only when you've configured OAuth and confirmed each post.
- **Approval tokens**: every side-effecting call is two-step. The first call returns a preview + single-use token (10-min TTL, payload-hashed). If the content changes between preview and confirm, the action is blocked — the human always sees exactly what will happen.
- **No secrets on disk**: the access token lives in an env var. The config loader rejects files containing credential keys. `.gitignore` covers config and data dirs.
- **Metric honesty**: `rewrite_experience` flags bullets that need metrics but never fabricates numbers.
- **Pacing**: apply manual edits gradually; consider disabling "Share profile updates with your network" in LinkedIn settings before a big revamp.

## Development

```bash
npm run dev        # run from source (tsx)
npm test           # vitest, 30 tests
npm run inspector  # MCP Inspector UI against the built server
```

## Project structure

```
src/
  index.ts                     # MCP server, 10 tool registrations (stdio)
  types.ts                     # Profile domain types + Zod schemas
  config.ts                    # local config, credential-key rejection
  keywords.ts                  # role keyword banks, JD keyword extraction
  tools/                       # one module per tool (pure, testable)
  linkedin/
    officialApiClient.ts       # ONLY code that talks to LinkedIn (OIDC userinfo + Posts API)
    browserOpenOnly.ts         # OS-level "open URL" — the only browser interaction
  storage/localProfileStore.ts # local snapshots + exports
  safety/
    approvals.ts               # two-step HITL approval tokens
    riskLabels.ts              # risk taxonomy shown in every tool description
tests/                         # vitest suites: snapshot, analysis, safety
scripts/smoke.mjs              # stdio boot + tools/list smoke test
```

## License

MIT
