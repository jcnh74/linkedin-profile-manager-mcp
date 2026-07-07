/**
 * Human-in-the-loop approval gate.
 *
 * Every tool with external side effects (opening a browser, publishing a post)
 * takes a `confirm` boolean. The FIRST call must be made with confirm=false
 * (or omitted); the tool then returns a preview + an approval token. The
 * SECOND call must pass confirm=true AND the token. Tokens are single-use
 * and expire after 10 minutes. This forces the MCP client to surface the
 * exact pending action to the human before it happens.
 */
import crypto from "node:crypto";

interface PendingApproval {
  token: string;
  action: string;
  payloadHash: string;
  createdAt: number;
}

const TTL_MS = 10 * 60 * 1000;
const pending = new Map<string, PendingApproval>();

function hashPayload(payload: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 16);
}

/** Stage an action; returns a token the human-approved second call must echo back. */
export function requestApproval(action: string, payload: unknown): string {
  const token = crypto.randomBytes(8).toString("hex");
  pending.set(token, {
    token,
    action,
    payloadHash: hashPayload(payload),
    createdAt: Date.now(),
  });
  return token;
}

export type ApprovalResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Validate and consume (single-use) an approval token. */
export function consumeApproval(
  token: string | undefined,
  action: string,
  payload: unknown
): ApprovalResult {
  if (!token) {
    return { ok: false, reason: "Missing approvalToken. Call the tool without confirm first to get a preview and token." };
  }
  const p = pending.get(token);
  if (!p) return { ok: false, reason: "Unknown or already-used approval token." };
  pending.delete(token); // single use
  if (Date.now() - p.createdAt > TTL_MS) {
    return { ok: false, reason: "Approval token expired (10 min). Re-run the preview step." };
  }
  if (p.action !== action) {
    return { ok: false, reason: `Token was issued for action "${p.action}", not "${action}".` };
  }
  if (p.payloadHash !== hashPayload(payload)) {
    return { ok: false, reason: "Payload changed since the preview. Re-run the preview step so the human sees the final content." };
  }
  return { ok: true };
}

/** For tests. */
export function _clearApprovals(): void {
  pending.clear();
}
