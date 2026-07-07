/**
 * Risk labels attached to every tool so MCP clients (and humans) can see
 * at a glance what a tool can and cannot do.
 */
export type RiskLevel =
  | "read-only" // analyzes local data only
  | "draft-only" // generates text, writes nothing to LinkedIn
  | "local-write" // writes files on the local machine only
  | "opens-browser" // opens a URL for MANUAL action; performs no clicks
  | "publishes-content"; // can hit official LinkedIn API after explicit confirmation

export interface RiskLabel {
  level: RiskLevel;
  summary: string;
  requiresConfirmation: boolean;
}

export const RISK: Record<RiskLevel, RiskLabel> = {
  "read-only": {
    level: "read-only",
    summary: "Reads/analyzes locally stored profile data. No network calls to LinkedIn.",
    requiresConfirmation: false,
  },
  "draft-only": {
    level: "draft-only",
    summary: "Generates draft text locally. Nothing is sent to LinkedIn.",
    requiresConfirmation: false,
  },
  "local-write": {
    level: "local-write",
    summary: "Writes files to the local data directory. Nothing is sent to LinkedIn.",
    requiresConfirmation: false,
  },
  "opens-browser": {
    level: "opens-browser",
    summary:
      "Opens a LinkedIn edit page in your default browser for MANUAL editing. No automation, no auto-save.",
    requiresConfirmation: true,
  },
  "publishes-content": {
    level: "publishes-content",
    summary:
      "Can publish via the OFFICIAL LinkedIn API (OAuth, w_member_social). Requires confirm=true AND enableOfficialPosting in config.",
    requiresConfirmation: true,
  },
};

export function riskBanner(level: RiskLevel): string {
  const r = RISK[level];
  return `[risk: ${r.level}${r.requiresConfirmation ? " | confirmation required" : ""}] ${r.summary}`;
}
