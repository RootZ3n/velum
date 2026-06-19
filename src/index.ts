/**
 * Velum — AI Privacy & Injection Defense
 * ============================================================
 * Public API barrel. Import everything from "velum-ai", or pull adapters from
 * "velum-ai/adapters/{fastify,express,generic}".
 * ============================================================
 */

// ── Core: classification ──
export {
  classify,
  type Classification,
  type ClassificationResult,
  type ClassifyOptions,
} from "./core/classify.js";

// ── Core: three-stage guard ──
export {
  maxDecision,
  scanInput,
  scanContext,
  scanOutput,
  applyOutputGuardSync,
  type Decision,
  type Stage,
  type ScanResult,
  type ContextScanInput,
  type ContextScanResult,
  type OutputGuardResult,
} from "./core/guard.js";

// ── Core: PII ──
export {
  scanPii,
  maskPii,
  demask,
  sanitizePii,
  processWithPii,
  getDetectionLog,
  clearDetectionLog,
  type PiiDetection,
  type PiiLevel,
  type PiiResult,
  type PiiLogEntry,
} from "./core/pii.js";

// ── Core: credential buffer ──
export {
  storeCredential,
  getCredential,
  consumeCredential,
  getAvailableCredentials,
  clearExpiredCredentials,
  clearAllCredentials,
  setCredentialTtl,
  getCredentialTtl,
  DEFAULT_TTL_MS,
  type CredentialEntry,
  type CredentialMetadata,
} from "./core/credential-buffer.js";

// ── Core: pattern registry ──
export {
  createRegistry,
  registry,
  DEFAULT_NEVER_REDACT,
  type PatternDefinition,
  type PatternRegistry,
  type PatternCategory,
  type PatternSeverity,
} from "./core/patterns.js";

// ── Config ──
export {
  validateConfig,
  VelumConfigError,
  type VelumConfig,
  type VelumModuleConfig,
} from "./config/schema.js";
export {
  DEFAULT_CONFIG,
  loadConfig,
  configFromEnv,
  applyRuntimeConfig,
  parseConfigYaml,
  type LoadConfigOptions,
} from "./config/defaults.js";

// ── Adapters ──
export { createVelum, type Velum } from "./adapters/generic.js";
export { velumExpress, type VelumExpressOptions } from "./adapters/express.js";
export { velumFastify, type VelumFastifyOptions } from "./adapters/fastify.js";

// ── Pipeline ──
export {
  guardRequest,
  guardResponse,
  type GuardRequestInput,
  type GuardRequestResult,
  type GuardResponseInput,
  type GuardResponseResult,
} from "./core/pipeline.js";
