#!/usr/bin/env node
/**
 * Smoke test: spawn the built server on stdio, initialize, list tools.
 * Run: npm run smoke   (after npm run build)
 */
import { spawn } from "node:child_process";

const child = spawn("node", ["dist/index.js"], { stdio: ["pipe", "pipe", "inherit"] });

const msgs = [
  { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1.0" } } },
  { jsonrpc: "2.0", method: "notifications/initialized" },
  { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
];
for (const m of msgs) child.stdin.write(JSON.stringify(m) + "\n");

let buf = "";
child.stdout.on("data", (d) => {
  buf += d.toString();
  for (const line of buf.split("\n")) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id === 2) {
        const tools = msg.result.tools;
        console.log(`OK — server exposes ${tools.length} tools:`);
        for (const t of tools) console.log(`  - ${t.name}`);
        child.kill();
        process.exit(tools.length === 10 ? 0 : 1);
      }
    } catch { /* partial line */ }
  }
});

setTimeout(() => {
  console.error("Smoke test timed out");
  child.kill();
  process.exit(1);
}, 10000);
