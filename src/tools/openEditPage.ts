/**
 * open_edit_page — opens a LinkedIn edit URL in the user's default browser
 * for MANUAL action. Two-step approval like all side-effecting tools.
 * No automation beyond the OS-level `open <url>`.
 */
import { z } from "zod";
import { EDIT_URLS, editUrlFor, openInBrowser } from "../linkedin/browserOpenOnly.js";
import { requestApproval, consumeApproval } from "../safety/approvals.js";

export const OpenEditPageInput = z.object({
  section: z
    .enum(Object.keys(EDIT_URLS) as [string, ...string[]])
    .describe(`Which edit page to open: ${Object.keys(EDIT_URLS).join(", ")}`),
  confirm: z.boolean().default(false),
  approvalToken: z.string().optional(),
});
export type OpenEditPageArgs = z.infer<typeof OpenEditPageInput>;

export interface OpenEditPageResult {
  status: "preview" | "opened" | "blocked";
  url: string;
  message: string;
  approvalToken?: string;
}

export function runOpenEditPage(
  args: OpenEditPageArgs,
  opener: typeof openInBrowser = openInBrowser
): OpenEditPageResult {
  const url = editUrlFor(args.section);
  const payload = { section: args.section, url };

  if (!args.confirm) {
    const token = requestApproval("open_edit_page", payload);
    return {
      status: "preview",
      url,
      approvalToken: token,
      message: `Will open ${url} in your default browser for MANUAL editing (no clicks, no auto-save). Confirm with the user, then call again with confirm=true and approvalToken="${token}".`,
    };
  }

  const approval = consumeApproval(args.approvalToken, "open_edit_page", payload);
  if (!approval.ok) {
    return { status: "blocked", url, message: `Blocked: ${approval.reason}` };
  }

  opener(url);
  return {
    status: "opened",
    url,
    message: `Opened ${url}. Make the edits yourself and click Save when you're happy — nothing is automated.`,
  };
}
