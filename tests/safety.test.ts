import { describe, it, expect, beforeEach } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { ProfileSchema } from "../src/types.js";
import { runGenerateUpdatePlan, planToMarkdown } from "../src/tools/generateUpdatePlan.js";
import { runExportProfilePatch } from "../src/tools/exportProfilePatch.js";
import { LocalProfileStore } from "../src/storage/localProfileStore.js";
import { runOpenEditPage } from "../src/tools/openEditPage.js";
import { runCreateLinkedInPost } from "../src/tools/createLinkedInPost.js";
import { assertSafeLinkedInUrl, openInBrowser } from "../src/linkedin/browserOpenOnly.js";
import { requestApproval, consumeApproval, _clearApprovals } from "../src/safety/approvals.js";
import { ConfigSchema } from "../src/config.js";

const profile = ProfileSchema.parse({
  headline: "Old headline",
  about: "Old about",
  skills: ["React"],
  experience: [{ title: "Senior Engineer", company: "Acme Corp", bullets: ["Did things"] }],
});

beforeEach(() => _clearApprovals());

describe("generate_update_plan", () => {
  it("builds steps with old text from snapshot, edit URLs, and manual instructions", () => {
    const plan = runGenerateUpdatePlan(
      [
        { field: "Headline", newText: "New headline", rationale: "clearer" },
        { field: "Experience > Acme Corp > Senior Engineer", newText: "• Shipped things", rationale: "impact" },
      ],
      profile
    );
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].oldText).toBe("Old headline");
    expect(plan.steps[0].editUrl).toContain("linkedin.com/in/me");
    expect(plan.steps[1].oldText).toContain("Did things");
    expect(plan.steps[0].instructions).toContain("click Save yourself");
    expect(plan.steps.every((s) => s.risk === "manual-edit")).toBe(true);
  });

  it("renders markdown with old/new blocks", () => {
    const plan = runGenerateUpdatePlan([{ field: "About", newText: "New about", rationale: "r" }], profile);
    const md = planToMarkdown(plan);
    expect(md).toContain("**Old:**");
    expect(md).toContain("New about");
  });
});

describe("export_profile_patch", () => {
  it("writes markdown + json locally", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "li-mcp-"));
    const store = new LocalProfileStore(dir);
    const plan = runGenerateUpdatePlan([{ field: "Headline", newText: "X", rationale: "" }], profile);
    const res = runExportProfilePatch(plan, "test-patch", store);
    expect(fs.existsSync(res.markdownPath)).toBe(true);
    expect(fs.existsSync(res.jsonPath)).toBe(true);
    expect(JSON.parse(fs.readFileSync(res.jsonPath, "utf8")).steps).toHaveLength(1);
  });
});

describe("approvals (HITL gate)", () => {
  it("issues then consumes a token exactly once", () => {
    const t = requestApproval("open_edit_page", { a: 1 });
    expect(consumeApproval(t, "open_edit_page", { a: 1 }).ok).toBe(true);
    expect(consumeApproval(t, "open_edit_page", { a: 1 }).ok).toBe(false); // single use
  });

  it("rejects wrong action or changed payload", () => {
    const t1 = requestApproval("open_edit_page", { a: 1 });
    expect(consumeApproval(t1, "create_linkedin_post", { a: 1 }).ok).toBe(false);
    const t2 = requestApproval("open_edit_page", { a: 1 });
    expect(consumeApproval(t2, "open_edit_page", { a: 2 }).ok).toBe(false);
  });
});

describe("open_edit_page", () => {
  it("previews first and never opens without approval", () => {
    let opened = false;
    const fakeOpener = ((url: string) => {
      opened = true;
      return { command: "open", args: [url] };
    }) as typeof openInBrowser;

    const preview = runOpenEditPage({ section: "headline", confirm: false }, fakeOpener);
    expect(preview.status).toBe("preview");
    expect(opened).toBe(false);
    expect(preview.approvalToken).toBeTruthy();

    const done = runOpenEditPage(
      { section: "headline", confirm: true, approvalToken: preview.approvalToken },
      fakeOpener
    );
    expect(done.status).toBe("opened");
    expect(opened).toBe(true);
  });

  it("blocks confirm without a valid token", () => {
    const res = runOpenEditPage({ section: "about", confirm: true, approvalToken: "bogus" }, (() => {
      throw new Error("should not open");
    }) as unknown as typeof openInBrowser);
    expect(res.status).toBe("blocked");
  });

  it("only allows linkedin.com URLs", () => {
    expect(() => assertSafeLinkedInUrl("https://evil.example.com/phish")).toThrow();
    expect(() => assertSafeLinkedInUrl("http://www.linkedin.com/in/me/")).toThrow(); // http not allowed
    expect(() => assertSafeLinkedInUrl("https://www.linkedin.com/in/me/")).not.toThrow();
  });
});

describe("create_linkedin_post", () => {
  const baseConfig = ConfigSchema.parse({});

  it("returns a draft and never publishes on the first call", async () => {
    const res = await runCreateLinkedInPost(
      { text: "Hello world", visibility: "PUBLIC", confirm: false },
      baseConfig,
      () => {
        throw new Error("API must not be constructed for drafts");
      }
    );
    expect(res.status).toBe("draft");
    expect(res.approvalToken).toBeTruthy();
    expect(res.message).toContain("DRAFT ONLY");
  });

  it("blocks publishing without OAuth token even with valid approval", async () => {
    delete process.env.LINKEDIN_ACCESS_TOKEN;
    const draft = await runCreateLinkedInPost({ text: "Hi", visibility: "PUBLIC", confirm: false }, baseConfig);
    const res = await runCreateLinkedInPost(
      { text: "Hi", visibility: "PUBLIC", confirm: true, approvalToken: draft.approvalToken },
      baseConfig
    );
    expect(res.status).toBe("blocked");
    expect(res.message).toContain("LINKEDIN_ACCESS_TOKEN");
  });

  it("blocks publishing when enableOfficialPosting=false even with a token", async () => {
    process.env.LINKEDIN_ACCESS_TOKEN = "fake-token";
    try {
      const draft = await runCreateLinkedInPost({ text: "Hi2", visibility: "PUBLIC", confirm: false }, baseConfig);
      const res = await runCreateLinkedInPost(
        { text: "Hi2", visibility: "PUBLIC", confirm: true, approvalToken: draft.approvalToken },
        baseConfig
      );
      expect(res.status).toBe("blocked");
      expect(res.message).toContain("enableOfficialPosting");
    } finally {
      delete process.env.LINKEDIN_ACCESS_TOKEN;
    }
  });

  it("publishes via the official client only when fully configured + approved", async () => {
    process.env.LINKEDIN_ACCESS_TOKEN = "fake-token";
    try {
      const cfg = ConfigSchema.parse({ enableOfficialPosting: true });
      let posted = "";
      const draft = await runCreateLinkedInPost({ text: "Ship it", visibility: "PUBLIC", confirm: false }, cfg);
      const res = await runCreateLinkedInPost(
        { text: "Ship it", visibility: "PUBLIC", confirm: true, approvalToken: draft.approvalToken },
        cfg,
        () => ({
          createTextPost: async (text: string) => {
            posted = text;
            return { postUrn: "urn:li:share:123" };
          },
        })
      );
      expect(res.status).toBe("published");
      expect(res.postUrn).toBe("urn:li:share:123");
      expect(posted).toBe("Ship it");
    } finally {
      delete process.env.LINKEDIN_ACCESS_TOKEN;
    }
  });

  it("blocks if payload changed between preview and confirm", async () => {
    process.env.LINKEDIN_ACCESS_TOKEN = "fake-token";
    try {
      const cfg = ConfigSchema.parse({ enableOfficialPosting: true });
      const draft = await runCreateLinkedInPost({ text: "original", visibility: "PUBLIC", confirm: false }, cfg);
      const res = await runCreateLinkedInPost(
        { text: "SNEAKILY CHANGED", visibility: "PUBLIC", confirm: true, approvalToken: draft.approvalToken },
        cfg,
        () => {
          throw new Error("must not post");
        }
      );
      expect(res.status).toBe("blocked");
      expect(res.message).toContain("Payload changed");
    } finally {
      delete process.env.LINKEDIN_ACCESS_TOKEN;
    }
  });
});
