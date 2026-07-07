/**
 * OFFICIAL LinkedIn API client — the ONLY code path in this project that
 * talks to LinkedIn servers.
 *
 * Scope of this client (deliberately tiny):
 *   - GET  /v2/userinfo            (OpenID Connect: who am I)   scope: openid profile
 *   - POST /rest/posts             (Share on LinkedIn)          scope: w_member_social
 *
 * LinkedIn's public developer platform does NOT expose self-serve endpoints
 * for editing headline / about / experience / skills on personal profiles.
 * Therefore this project intentionally has no profile-edit API code —
 * those changes are drafted locally and applied manually by the user.
 *
 * Token comes from the LINKEDIN_ACCESS_TOKEN env var only. Never persisted.
 */

const API_BASE = "https://api.linkedin.com";
const LINKEDIN_VERSION = "202506"; // Rest API versioning header

export interface UserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
}

export class OfficialApiClient {
  constructor(private accessToken: string) {
    if (!accessToken) throw new Error("Missing access token");
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LINKEDIN_VERSION,
      ...extra,
    };
  }

  /** OIDC userinfo — needed to get the member URN for posting. */
  async getUserInfo(): Promise<UserInfo> {
    const res = await fetch(`${API_BASE}/v2/userinfo`, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`userinfo failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as UserInfo;
  }

  /**
   * Create a text post via the official Posts API (w_member_social).
   * Only called after the human-in-the-loop approval flow has passed.
   */
  async createTextPost(text: string, visibility: "PUBLIC" | "CONNECTIONS" = "PUBLIC"): Promise<{ postUrn: string }> {
    const me = await this.getUserInfo();
    const body = {
      author: `urn:li:person:${me.sub}`,
      commentary: text,
      visibility,
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };
    const res = await fetch(`${API_BASE}/rest/posts`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`post creation failed: ${res.status} ${await res.text()}`);
    }
    const urn = res.headers.get("x-restli-id") ?? "unknown";
    return { postUrn: urn };
  }
}
