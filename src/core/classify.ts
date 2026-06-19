/**
 * Velum — Classification Engine
 * ============================================================
 * Classifies a single message into one trust category, redacting credentials
 * (and stashing them in the credential buffer) before they can reach a model.
 *
 * Priority:
 *   1. Credentials   → redact + buffer  → CREDENTIAL
 *   2. Injection     → flag             → PROMPT_INJECTION / INSTRUCTION_OVERRIDE / …
 *   3. Otherwise     → pass             → SAFE
 *
 * Known-safe terms (registry.neverRedact) and module/class-like tokens are
 * filtered out of credential matches to avoid false positives.
 * ============================================================
 */

import { registry as defaultRegistry, type PatternRegistry } from "./patterns.js";
import { storeCredential } from "./credential-buffer.js";

export type Classification =
  | "SAFE"
  | "CREDENTIAL"
  | "PROMPT_INJECTION"
  | "INSTRUCTION_OVERRIDE"
  | "MEMORY_MANIPULATION"
  | "BOUNDARY_PROBE"
  | "UNSAFE_CONTENT";

export interface ClassificationResult {
  classification: Classification;
  action: "passed" | "redacted" | "flagged";
  sanitizedMessage: string;
  warnings: string[];
  patternsMatched: string[];
  credentialBufferIds: string[];
}

export interface ClassifyOptions {
  /** Store redacted credentials in the buffer (default true). */
  storeInBuffer?: boolean;
  /** Registry to draw patterns from (default: shared registry). */
  registry?: PatternRegistry;
}

const REDACTED = "[REDACTED-CREDENTIAL]";

const CREDENTIAL_WARNING =
  "Credential detected and secured. If this was for a tool setup, continue with your request and the tool will retrieve it automatically.";

// Maps an injection pattern name → the classification it implies.
const INJECTION_CLASSIFICATION: Record<string, Classification> = {
  ignore_instructions: "PROMPT_INJECTION",
  ignore_system_prompt: "PROMPT_INJECTION",
  disregard: "PROMPT_INJECTION",
  you_are_now: "INSTRUCTION_OVERRIDE",
  forget_everything: "INSTRUCTION_OVERRIDE",
  new_instructions: "INSTRUCTION_OVERRIDE",
  pretend_you_are: "INSTRUCTION_OVERRIDE",
  no_restrictions: "BOUNDARY_PROBE",
  dan_mode: "BOUNDARY_PROBE",
  jailbreak: "BOUNDARY_PROBE",
  reveal_system_prompt: "BOUNDARY_PROBE",
  exfiltrate_secrets: "BOUNDARY_PROBE",
  memory_manipulation: "MEMORY_MANIPULATION",
};

/** True if a matched value should be treated as known-safe (never a credential). */
function isSafeMatch(value: string, neverRedact: Set<string>): boolean {
  const lower = value.toLowerCase();
  for (const safe of neverRedact) {
    if (lower.includes(safe)) return true;
  }
  // Dotted names like "gamekeeper.library" — module/class references.
  if (/^[a-z]+\.[a-z]+/.test(lower)) return true;
  // Triple-hyphenated tool ids like "peh-tool-name".
  if (/^[a-z]+-[a-z]+-[a-z]+$/.test(lower)) return true;
  return false;
}

function execAll(regex: RegExp, text: string): string[] {
  regex.lastIndex = 0;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    out.push(m[0]);
    // Guard against zero-length matches spinning forever.
    if (m.index === regex.lastIndex) regex.lastIndex++;
  }
  regex.lastIndex = 0;
  return out;
}

export function classify(
  message: string,
  sessionId?: string,
  options: ClassifyOptions = {},
): ClassificationResult {
  void sessionId; // accepted for API symmetry / audit hooks; not used in core
  const registry = options.registry ?? defaultRegistry;
  const storeInBuffer = options.storeInBuffer !== false;

  const warnings: string[] = [];
  const patternsMatched: string[] = [];
  const credentialBufferIds: string[] = [];
  let sanitized = message ?? "";
  const source = message ?? "";

  // ── 1. Credential detection (highest priority) ──
  let foundCredential = false;
  for (const def of registry.credentialPatterns) {
    const matches = execAll(def.pattern, source);
    const realMatches = matches.filter((v) => !isSafeMatch(v, registry.neverRedact));
    if (realMatches.length === 0) continue;

    foundCredential = true;
    patternsMatched.push(def.name);

    for (const value of realMatches) {
      if (storeInBuffer) {
        const idx = source.indexOf(value);
        const start = Math.max(0, idx - 30);
        const end = Math.min(source.length, idx + value.length + 30);
        const context = source.slice(start, end).split(value).join("[VALUE]");
        credentialBufferIds.push(storeCredential(def.name, value, context));
      }
      sanitized = sanitized.split(value).join(REDACTED);
    }
  }

  if (foundCredential) {
    warnings.push(CREDENTIAL_WARNING);
    return {
      classification: "CREDENTIAL",
      action: "redacted",
      sanitizedMessage: sanitized,
      warnings,
      patternsMatched,
      credentialBufferIds,
    };
  }

  // ── 2. Injection / override detection (flag, don't redact) ──
  let classification: Classification = "SAFE";
  let flagged = false;
  for (const def of registry.injectionPatterns) {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(source)) {
      flagged = true;
      patternsMatched.push(def.name);
      classification = INJECTION_CLASSIFICATION[def.name] ?? "PROMPT_INJECTION";
    }
  }

  if (flagged) {
    return {
      classification,
      action: "flagged",
      sanitizedMessage: sanitized,
      warnings,
      patternsMatched,
      credentialBufferIds: [],
    };
  }

  // ── 3. Safe ──
  return {
    classification: "SAFE",
    action: "passed",
    sanitizedMessage: sanitized,
    warnings: [],
    patternsMatched: [],
    credentialBufferIds: [],
  };
}
