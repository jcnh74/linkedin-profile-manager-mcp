/**
 * browserOpenOnly — the ONLY browser interaction in this project.
 *
 * It opens a LinkedIn URL in the user's default browser via the OS
 * (`open` on macOS, `xdg-open` on Linux, `start` on Windows) and then does
 * NOTHING else. No Playwright/Puppeteer, no DOM access, no clicking, no
 * form-filling, no auto-save. The human does the editing and saving.
 */
import { execFile } from "node:child_process";

/** Known LinkedIn self-profile edit destinations (manual editing only). */
export const EDIT_URLS: Record<string, string> = {
  profile: "https://www.linkedin.com/in/me/",
  headline: "https://www.linkedin.com/in/me/edit/intro/", // intro modal contains headline
  about: "https://www.linkedin.com/in/me/edit/about/",
  experience: "https://www.linkedin.com/in/me/details/experience/",
  skills: "https://www.linkedin.com/in/me/details/skills/",
  featured: "https://www.linkedin.com/in/me/details/featured/",
  education: "https://www.linkedin.com/in/me/details/education/",
  "public-profile-settings": "https://www.linkedin.com/public-profile/settings",
};

export type EditSection = keyof typeof EDIT_URLS;

export function editUrlFor(section: string): string {
  return EDIT_URLS[section] ?? EDIT_URLS["profile"];
}

const ALLOWED_HOST = "www.linkedin.com";

export function assertSafeLinkedInUrl(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "https:" || u.hostname !== ALLOWED_HOST) {
    throw new Error(`Refusing to open non-LinkedIn URL: ${url}`);
  }
}

/** Open a URL in the default browser. Returns the command used (for logging/tests). */
export function openInBrowser(url: string, dryRun = false): { command: string; args: string[] } {
  assertSafeLinkedInUrl(url);
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? { command: "open", args: [url] }
      : platform === "win32"
        ? { command: "cmd", args: ["/c", "start", "", url] }
        : { command: "xdg-open", args: [url] };
  if (!dryRun) {
    execFile(cmd.command, cmd.args, (err) => {
      if (err) console.error(`Failed to open browser: ${err.message}`);
    });
  }
  return cmd;
}
