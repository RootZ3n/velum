/**
 * Velum — Three-Stage Guard
 * ============================================================
 * A unified trust boundary applied at three points:
 *
 *   Stage 1 — INPUT:   user input before model execution
 *   Stage 2 — CONTEXT: model-bound context (tool/system/assistant content)
 *   Stage 3 — OUTPUT:  generated model output before it is shown/accepted
 *
 * Decisions (ascending severity):
 *   allow  — proceed normally
 *   warn   — proceed, but record it
 *   review — elevated scrutiny / annotate
 *   block  — stop (input: refuse; output: redact + refuse)
 * ============================================================
 */

import { registry as defaultRegistry, type PatternRegistry, type PatternDefinition } from "./patterns.js";

export type Decision = "allow" | "warn" | "review" | "block";
export type Stage = "input" | "context" | "output";

export interface ScanResult {
  decision: Decision;
  reasons: string[];
  flags: string[];
  /** Populated when the guard produced a sanitized/redacted version of the text. */
  redacted?: string;
}

export interface ContextScanInput {
  role: string;
  content: unknown;
}

export interface ContextScanResult extends ScanResult {
  /** When secrets were found and redacted, this carries the sanitized messages. */
  redactedMessages?: ContextScanInput[];
}

export interface OutputGuardResult {
  /** Text the client should see (redacted on warn/review, refusal on block, else original). */
  text: string;
  /** Raw scan result, for receipts/telemetry. */
  scan: ScanResult;
  /** True when text was replaced with a refusal (block decision). */
  blocked: boolean;
  /** True when secrets were redacted in-place (non-block decision). */
  redacted: boolean;
}

const REDACTED_SECRET = "[REDACTED-SECRET]";

const DECISION_ORDER: Record<Decision, number> = { allow: 0, warn: 1, review: 2, block: 3 };

export function maxDecision(a: Decision, b: Decision): Decision {
  return DECISION_ORDER[b] > DECISION_ORDER[a] ? b : a;
}

const severityToDecision: Record<PatternDefinition["severity"], Decision> = {
  block: "block",
  review: "review",
  warn: "warn",
};

function reset(re: RegExp): RegExp {
  re.lastIndex = 0;
  return re;
}

// ── Stage 1: INPUT ───────────────────────────────────────────────────────────

export function scanInput(text: string, registry: PatternRegistry = defaultRegistry): ScanResult {
  const reasons: string[] = [];
  const flags: string[] = [];
  let decision: Decision = "allow";
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { decision, reasons, flags };

  for (const def of registry.injectionPatterns) {
    if (reset(def.pattern).test(trimmed)) {
      flags.push(def.name);
      reasons.push(`input:${def.name}`);
      decision = maxDecision(decision, severityToDecision[def.severity]);
    }
  }
  return { decision, reasons, flags };
}

// ── Stage 2: CONTEXT ─────────────────────────────────────────────────────────
// Content here comes from *our* side of the trust boundary (tool output, system,
// prior assistant turns). Embedded injection is a strong signal of tainted data;
// embedded secrets must be redacted before reaching the model. User content is
// covered by scanInput and passes through untouched.

export function scanContext(
  messages: ContextScanInput[],
  registry: PatternRegistry = defaultRegistry,
): ContextScanResult {
  const reasons: string[] = [];
  const flags: string[] = [];
  let decision: Decision = "allow";
  let didRedact = false;
  const redactedMessages: ContextScanInput[] = [];

  for (const msg of messages) {
    if (msg.role === "user" || typeof msg.content !== "string") {
      redactedMessages.push(msg);
      continue;
    }

    let content = msg.content;

    // Embedded injection — prior assistant turns are own-voice (warn), other
    // roles (tool/system/etc.) are higher risk (review).
    for (const def of registry.injectionPatterns) {
      if (reset(def.pattern).test(content)) {
        flags.push(`${msg.role}:${def.name}`);
        reasons.push(`context-${msg.role}:${def.name}`);
        const severity: Decision = msg.role === "assistant" ? "warn" : "review";
        decision = maxDecision(decision, severity);
      }
    }

    // Embedded secrets — redact in place.
    for (const def of registry.credentialPatterns) {
      reset(def.pattern);
      if (def.pattern.test(content)) {
        flags.push(`${msg.role}:${def.name}`);
        reasons.push(`context-${msg.role}:${def.name}`);
        decision = maxDecision(decision, "warn");
        content = content.replace(reset(def.pattern), REDACTED_SECRET);
        didRedact = true;
      }
    }

    redactedMessages.push({ role: msg.role, content });
  }

  const result: ContextScanResult = { decision, reasons, flags };
  if (didRedact) {
    result.redacted = redactedMessages
      .map((m) => (typeof m.content === "string" ? m.content : ""))
      .join("\n");
    result.redactedMessages = redactedMessages;
  }
  return result;
}

// ── Stage 3: OUTPUT ──────────────────────────────────────────────────────────

export function scanOutput(text: string, registry: PatternRegistry = defaultRegistry): ScanResult {
  const reasons: string[] = [];
  const flags: string[] = [];
  let decision: Decision = "allow";
  const source = text ?? "";
  if (!source) return { decision, reasons, flags };

  let redacted = source;
  let didRedact = false;

  // Secrets in output are an immediate block + redact.
  for (const def of registry.credentialPatterns) {
    const matches = source.match(reset(def.pattern));
    if (matches && matches.length > 0) {
      flags.push(def.name);
      reasons.push(`output:${def.name}(${matches.length})`);
      decision = maxDecision(decision, "block");
      redacted = redacted.replace(reset(def.pattern), REDACTED_SECRET);
      didRedact = true;
    }
  }

  // Policy-weakening patterns → review (operators should see them).
  for (const def of registry.policyPatterns) {
    if (reset(def.pattern).test(source)) {
      flags.push(def.name);
      reasons.push(`output:${def.name}`);
      decision = maxDecision(decision, "review");
    }
  }

  const result: ScanResult = { decision, reasons, flags };
  if (didRedact) result.redacted = redacted;
  return result;
}

// ── Pure output-guard transform ──────────────────────────────────────────────

const IN_CHARACTER_REFUSAL =
  "I stopped that response before it left — it was about to include a secret. Ask again and I'll answer without the sensitive part.";
const NEUTRAL_REFUSAL =
  "Response blocked by policy (Velum output guard: potential secret leakage).";

/**
 * Scan a candidate model output and return the text the client should see:
 *   - block  → a refusal substitute (never the original)
 *   - secret redacted (non-block) → the redacted text
 *   - otherwise → the original text
 * Always returns non-empty text on block.
 */
export function applyOutputGuardSync(
  text: string,
  opts: { inCharacter: boolean } = { inCharacter: false },
  registry: PatternRegistry = defaultRegistry,
): OutputGuardResult {
  const scan = scanOutput(text ?? "", registry);
  if (scan.decision === "block") {
    return {
      text: opts.inCharacter ? IN_CHARACTER_REFUSAL : NEUTRAL_REFUSAL,
      scan,
      blocked: true,
      redacted: false,
    };
  }
  if (scan.redacted) {
    return { text: scan.redacted, scan, blocked: false, redacted: true };
  }
  return { text: text ?? "", scan, blocked: false, redacted: false };
}
