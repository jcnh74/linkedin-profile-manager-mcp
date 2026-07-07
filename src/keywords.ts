/**
 * Keyword banks per target role — used by audit, headline generation,
 * and keyword gap analysis. Curated from common recruiter search terms.
 */
import { TargetRole } from "./types.js";

export const ROLE_KEYWORDS: Record<TargetRole, string[]> = {
  "senior-full-stack-engineer": [
    "full stack", "senior software engineer", "react", "node.js", "typescript",
    "javascript", "api design", "rest", "graphql", "postgresql", "aws",
    "ci/cd", "docker", "system design", "microservices", "testing",
  ],
  "agentic-ai-systems-engineer": [
    "agentic", "ai agents", "llm", "mcp", "model context protocol",
    "tool calling", "function calling", "rag", "orchestration", "langchain",
    "openai", "anthropic", "claude", "prompt engineering", "evals",
    "multi-agent", "python", "typescript", "vector database",
  ],
  "ai-automation-consultant": [
    "ai automation", "workflow automation", "consultant", "llm integration",
    "business process", "roi", "n8n", "zapier", "make", "custom gpt",
    "chatbot", "api integration", "discovery", "solution architecture",
    "ai strategy", "client delivery",
  ],
  "react-python-php-engineer": [
    "react", "python", "php", "laravel", "wordpress", "django", "fastapi",
    "javascript", "typescript", "mysql", "rest api", "frontend", "backend",
    "full stack", "legacy modernization",
  ],
};

export const GENERIC_STRONG_SIGNALS = [
  "led", "built", "shipped", "scaled", "reduced", "increased", "launched",
  "migrated", "designed", "architected", "automated", "mentored",
];

export const WEAK_PHRASES = [
  "responsible for", "worked on", "helped with", "assisted", "duties included",
  "team player", "hard-working", "passionate", "results-driven", "synergy",
  "go-getter", "detail-oriented", "motivated professional",
];

const WORD_RE = /[a-z0-9+#./-]+/g;

export function textContainsKeyword(text: string, keyword: string): boolean {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

export function keywordCoverage(text: string, keywords: string[]): {
  present: string[];
  missing: string[];
  score: number; // 0-100
} {
  const present = keywords.filter((k) => textContainsKeyword(text, k));
  const missing = keywords.filter((k) => !textContainsKeyword(text, k));
  const score = keywords.length === 0 ? 0 : Math.round((present.length / keywords.length) * 100);
  return { present, missing, score };
}

/** Extract candidate keywords (1-2 word phrases) from a job description. */
export function extractKeywordsFromJD(jd: string, limit = 40): string[] {
  const stop = new Set([
    "the", "and", "for", "with", "you", "our", "are", "will", "have", "this",
    "that", "your", "from", "not", "all", "can", "who", "what", "when", "how",
    "job", "role", "team", "work", "years", "experience", "skills", "ability",
    "strong", "including", "required", "preferred", "must", "plus", "etc",
    "about", "more", "than", "such", "other", "into", "across", "within",
  ]);
  const words = (jd.toLowerCase().match(WORD_RE) ?? []).filter(
    (w) => w.length > 2 && !stop.has(w) && !/^\d+$/.test(w)
  );
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  // bigrams
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    counts.set(bg, (counts.get(bg) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}
