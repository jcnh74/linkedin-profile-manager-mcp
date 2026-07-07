import { describe, it, expect } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { LocalProfileStore, parseProfileText } from "../src/storage/localProfileStore.js";
import { runGetProfileSnapshot } from "../src/tools/getProfileSnapshot.js";
import { ConfigSchema } from "../src/config.js";

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "li-mcp-"));
  return { store: new LocalProfileStore(dir), dir };
}

const SAMPLE_TEXT = `John Doe
Senior Full Stack Engineer | React, Node.js, Python
About
I build production web platforms and agentic AI systems using TypeScript and Python.
Experience
Senior Engineer
Acme Corp · 2021 - Present
- Built a customer portal in React serving 40k users
- Reduced API latency by 60% via caching
Skills
React, Node.js, TypeScript, Python, AWS`;

describe("parseProfileText", () => {
  it("extracts name, headline, about, skills, and experience", () => {
    const p = parseProfileText(SAMPLE_TEXT);
    expect(p.name).toBe("John Doe");
    expect(p.headline).toContain("Senior Full Stack Engineer");
    expect(p.about).toContain("agentic AI systems");
    expect(p.skills).toContain("React");
    expect(p.skills).toContain("AWS");
    expect(p.experience.length).toBeGreaterThan(0);
    expect(p.experience[0].title).toBe("Senior Engineer");
    expect(p.experience[0].company).toBe("Acme Corp");
    expect(p.experience[0].bullets.length).toBe(2);
  });
});

describe("get_profile_snapshot", () => {
  const config = ConfigSchema.parse({ profileSlug: "johndoe" });

  it("saves and reloads a snapshot from pasted text", () => {
    const { store } = tmpStore();
    const res = runGetProfileSnapshot({ source: "pasted_text", text: SAMPLE_TEXT }, store, config);
    expect(res.profile?.name).toBe("John Doe");
    expect(res.savedTo).toBeTruthy();
    expect(res.profile?.customUrl).toBe("linkedin.com/in/johndoe");

    const loaded = runGetProfileSnapshot({ source: "load_saved" }, store, config);
    expect(loaded.profile?.name).toBe("John Doe");
  });

  it("accepts structured JSON", () => {
    const { store } = tmpStore();
    const res = runGetProfileSnapshot(
      { source: "json", json: { headline: "AI Engineer", skills: ["python"] } },
      store,
      config
    );
    expect(res.profile?.headline).toBe("AI Engineer");
  });

  it("returns manual export instructions when nothing saved", () => {
    const { store } = tmpStore();
    const res = runGetProfileSnapshot({ source: "load_saved" }, store, config);
    expect(res.profile).toBeNull();
    expect(res.message).toContain("Save to PDF");
  });

  it("rejects too-short text", () => {
    const { store } = tmpStore();
    expect(() => runGetProfileSnapshot({ source: "pasted_text", text: "hi" }, store, config)).toThrow();
  });
});
