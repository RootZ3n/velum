/**
 * Velum — PII Detection + Masking
 * ============================================================
 * Detects personally-identifiable information (email, phone, SSN, credit card,
 * IP, names) and applies one of three privacy levels:
 *
 *   Level 1 — Observe:  detect + log only, text unchanged
 *   Level 2 — Redact:   replace each value with a typed placeholder ([EMAIL_1]),
 *                       reversible via the returned placeholder map
 *   Level 3 — Sanitize: strip all PII to [REDACTED] (NOT reversible)
 *
 * Raw PII values are NEVER persisted — the detection log records type + count
 * only.
 * ============================================================
 */

import { registry as defaultRegistry, type PatternRegistry } from "./patterns.js";

export interface PiiDetection {
  type: string;
  value: string;
  start: number;
  end: number;
}

export type PiiLevel = 1 | 2 | 3; // Observe, Redact, Sanitize

export interface PiiResult {
  detections: Array<{ type: string; count: number }>;
  masked: boolean;
  level: PiiLevel;
  maskedText?: string;
  placeholderMap?: Map<string, string>;
}

// ── Detection log (in-memory, capped, type+count only) ───────────────────────

export interface PiiLogEntry {
  timestamp: string;
  level: PiiLevel;
  detections: Array<{ type: string; count: number }>;
  masked: boolean;
}

const MAX_LOG_ENTRIES = 500;
const detectionLog: PiiLogEntry[] = [];

export function getDetectionLog(): PiiLogEntry[] {
  return detectionLog;
}

export function clearDetectionLog(): void {
  detectionLog.length = 0;
}

function logDetections(level: PiiLevel, detections: Array<{ type: string; count: number }>, masked: boolean): void {
  if (detections.length === 0) return;
  detectionLog.push({ timestamp: new Date().toISOString(), level, detections, masked });
  while (detectionLog.length > MAX_LOG_ENTRIES) detectionLog.shift();
}

// ── Detection ────────────────────────────────────────────────────────────────

/**
 * Scan text for PII. Returns non-overlapping detections sorted by position
 * descending (so callers can replace back-to-front without shifting indices).
 */
export function scanPii(text: string, registry: PatternRegistry = defaultRegistry): PiiDetection[] {
  const source = text ?? "";
  const raw: PiiDetection[] = [];

  for (const def of registry.piiPatterns) {
    def.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = def.pattern.exec(source)) !== null) {
      raw.push({ type: def.name, value: m[0], start: m.index, end: m.index + m[0].length });
      if (m.index === def.pattern.lastIndex) def.pattern.lastIndex++;
    }
    def.pattern.lastIndex = 0;
  }

  // Resolve overlaps: prefer earlier start, then the longer match.
  raw.sort((a, b) => (a.start !== b.start ? a.start - b.start : b.end - a.end));
  const kept: PiiDetection[] = [];
  let lastEnd = -1;
  for (const d of raw) {
    if (d.start >= lastEnd) {
      kept.push(d);
      lastEnd = d.end;
    }
  }

  // Descending for safe back-to-front replacement.
  return kept.sort((a, b) => b.start - a.start);
}

function countByType(detections: PiiDetection[]): Array<{ type: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const d of detections) counts[d.type] = (counts[d.type] ?? 0) + 1;
  return Object.entries(counts).map(([type, count]) => ({ type, count }));
}

// ── Masking (Level 2) ────────────────────────────────────────────────────────

/** Replace PII with reversible typed placeholders. Returns text + placeholder map. */
export function maskPii(
  text: string,
  registry: PatternRegistry = defaultRegistry,
): { text: string; placeholderMap: Map<string, string> } {
  const source = text ?? "";
  const detections = scanPii(source, registry); // descending by start
  const placeholderMap = new Map<string, string>();
  const valueToPlaceholder = new Map<string, string>();
  const typeCounters: Record<string, number> = {};

  let result = source;
  for (const d of detections) {
    let placeholder = valueToPlaceholder.get(d.value);
    if (!placeholder) {
      const idx = (typeCounters[d.type] ?? 0) + 1;
      typeCounters[d.type] = idx;
      placeholder = `[${d.type}_${idx}]`;
      valueToPlaceholder.set(d.value, placeholder);
      placeholderMap.set(placeholder, d.value);
    }
    result = result.slice(0, d.start) + placeholder + result.slice(d.end);
  }

  return { text: result, placeholderMap };
}

/** Restore placeholders to their original values. */
export function demask(text: string, placeholderMap: Map<string, string>): string {
  let result = text ?? "";
  for (const [placeholder, original] of placeholderMap) {
    result = result.split(placeholder).join(original);
  }
  return result;
}

// ── Sanitizing (Level 3) ─────────────────────────────────────────────────────

/** Strip all PII to [REDACTED]. Not reversible. */
export function sanitizePii(text: string, registry: PatternRegistry = defaultRegistry): string {
  const source = text ?? "";
  const detections = scanPii(source, registry); // descending by start
  let result = source;
  for (const d of detections) {
    result = result.slice(0, d.start) + "[REDACTED]" + result.slice(d.end);
  }
  return result;
}

// ── Level-aware processing ───────────────────────────────────────────────────

export function processWithPii(
  text: string,
  level: PiiLevel,
  registry: PatternRegistry = defaultRegistry,
): PiiResult {
  const detections = scanPii(text, registry);
  const counts = countByType(detections);

  if (level === 1) {
    logDetections(1, counts, false);
    return { detections: counts, masked: false, level: 1 };
  }

  if (detections.length === 0) {
    logDetections(level, counts, false);
    return { detections: counts, masked: false, level };
  }

  if (level === 2) {
    const { text: maskedText, placeholderMap } = maskPii(text, registry);
    logDetections(2, counts, true);
    return { detections: counts, masked: true, level: 2, maskedText, placeholderMap };
  }

  // level === 3
  const maskedText = sanitizePii(text, registry);
  logDetections(3, counts, true);
  return { detections: counts, masked: true, level: 3, maskedText };
}
