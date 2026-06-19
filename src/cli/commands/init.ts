/**
 * `velum init` — generate a velum.config.yaml with documented defaults.
 */

import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const CONFIG_TEMPLATE = `# Velum configuration
# AI Privacy & Injection Defense — https://www.npmjs.com/package/velum-ai

# Master switch. When false, Velum passes everything through untouched.
enabled: true

# Default PII handling level for modules without an override:
#   1 = Observe  (detect + log only, text unchanged)
#   2 = Redact   (replace PII with reversible typed placeholders, e.g. [EMAIL_1])
#   3 = Sanitize (strip PII to [REDACTED], not reversible)
defaultPiiLevel: 1

# Credential buffer time-to-live, in milliseconds (default 5 minutes).
credentialBufferTtlMs: 300000

# Extra terms that must never be redacted as credentials (case-insensitive).
# Your product/tool names go here to avoid false positives.
neverRedact:
  - myproduct
  - myservice

# Optional JSONL audit log + receipts directory.
# auditLogPath: ./state/velum-audit.jsonl
# receiptsDir: ./state/receipts

# Per-module PII level overrides, keyed by module/route name.
modules:
  chat:
    piiLevel: 2
  internal:
    piiLevel: 1
`;

export interface InitOptions {
  cwd?: string;
  force?: boolean;
  path?: string;
}

export async function runInit(options: InitOptions = {}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const target = resolve(cwd, options.path ?? "velum.config.yaml");

  if (existsSync(target) && !options.force) {
    process.stderr.write(`velum init: ${target} already exists. Use --force to overwrite.\n`);
    return 1;
  }

  writeFileSync(target, CONFIG_TEMPLATE, "utf-8");
  process.stdout.write(`✓ Wrote ${target}\n`);
  return 0;
}
