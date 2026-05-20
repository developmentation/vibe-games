#!/usr/bin/env node
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

let payload = "";
process.stdin.on("data", (c) => (payload += c));
process.stdin.on("end", () => {
  try {
    const evt = JSON.parse(payload || "{}");
    const tool = evt?.tool_name ?? "unknown";
    const file = evt?.tool_input?.file_path ?? "";
    const line = `${new Date().toISOString()}\t${tool}\t${file}\n`;
    const log = ".claude/logs/edits.tsv";
    mkdirSync(dirname(log), { recursive: true });
    appendFileSync(log, line);
  } catch {}
  process.exit(0);
});
