/**
 * create_linkedin_post — draft-first, publish only via OFFICIAL API with
 * two-step human approval:
 *   call 1 (confirm=false): returns preview + approvalToken. Nothing sent.
 *   call 2 (confirm=true, approvalToken): publishes via official Posts API,
 *          only if OAuth token present AND enableOfficialPosting=true.
 */
import { z } from "zod";
import { Config, getOfficialAccessToken } from "../config.js";
import { OfficialApiClient } from "../linkedin/officialApiClient.js";
import { requestApproval, consumeApproval } from "../safety/approvals.js";

export const CreateLinkedInPostInput = z.object({
  text: z.string().min(1).max(3000).describe("Post body (LinkedIn cap: 3000 chars)."),
  visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
  confirm: z
    .boolean()
    .default(false)
    .describe("false = draft/preview only. true = publish (requires approvalToken from the preview step)."),
  approvalToken: z.string().optional(),
});
export type CreatePostArgs = z.infer<typeof CreateLinkedInPostInput>;

export interface CreatePostResult {
  status: "draft" | "published" | "blocked";
  message: string;
  approvalToken?: string;
  postUrn?: string;
}

export async function runCreateLinkedInPost(
  args: CreatePostArgs,
  config: Config,
  apiFactory: (token: string) => Pick<OfficialApiClient, "createTextPost"> = (t) => new OfficialApiClient(t)
): Promise<CreatePostResult> {
  const payload = { text: args.text, visibility: args.visibility };

  if (!args.confirm) {
    const token = requestApproval("create_linkedin_post", payload);
    const publishable = Boolean(getOfficialAccessToken()) && config.enableOfficialPosting;
    return {
      status: "draft",
      approvalToken: token,
      message: [
        `DRAFT ONLY — nothing was posted.`,
        ``,
        `--- post preview (${args.text.length}/3000 chars, ${args.visibility}) ---`,
        args.text,
        `--- end preview ---`,
        ``,
        publishable
          ? `To publish via the official LinkedIn API, ask the user to approve, then call again with confirm=true and approvalToken="${token}".`
          : `Publishing is NOT configured (needs LINKEDIN_ACCESS_TOKEN env var + enableOfficialPosting=true in config). Copy the draft and post manually at https://www.linkedin.com/feed/.`,
      ].join("\n"),
    };
  }

  // confirm=true path
  const approval = consumeApproval(args.approvalToken, "create_linkedin_post", payload);
  if (!approval.ok) {
    return { status: "blocked", message: `Publish blocked: ${approval.reason}` };
  }

  const token = getOfficialAccessToken();
  if (!token) {
    return {
      status: "blocked",
      message:
        "Publish blocked: no LINKEDIN_ACCESS_TOKEN configured. This server never posts through browser automation — configure official OAuth (w_member_social) or post manually.",
    };
  }
  if (!config.enableOfficialPosting) {
    return {
      status: "blocked",
      message: "Publish blocked: enableOfficialPosting=false in config. Enable it explicitly to allow official-API posting.",
    };
  }

  const client = apiFactory(token);
  const { postUrn } = await client.createTextPost(args.text, args.visibility);
  return {
    status: "published",
    postUrn,
    message: `Published via official LinkedIn API. Post URN: ${postUrn}`,
  };
}
