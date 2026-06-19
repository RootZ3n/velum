/**
 * Velum — Fastify adapter
 * ============================================================
 * Registers Velum hooks on a Fastify instance. Structural types are used
 * instead of importing `fastify` so Velum keeps zero dependencies; the shapes
 * match Fastify's hook signatures.
 *
 *   import { velumFastify } from "velum-ai/adapters/fastify";
 *   velumFastify(fastify, { defaultPiiLevel: 2 });
 *
 * Hooks:
 *   onRequest  — classify req.body.message (credentials redacted, injection flagged)
 *   preHandler — scanContext over req.body.messages (secrets redacted in place)
 *   onSend     — applyOutputGuard over the serialized response payload
 * ============================================================
 */

import { createVelum, type Velum } from "./generic.js";
import type { VelumConfig } from "../config/schema.js";
import type { ContextScanInput } from "../core/guard.js";
import type { ClassificationResult } from "../core/classify.js";

export interface VelumFastifyOptions extends Partial<VelumConfig> {
  inCharacter?: boolean;
  messageField?: string;
  messagesField?: string;
}

interface FastifyRequestLike {
  body?: unknown;
  velum?: Velum;
  velumClassification?: ClassificationResult;
  velumContextFlags?: string[];
  [key: string]: unknown;
}

type HookDone = (err?: unknown) => void;

interface FastifyLike {
  decorateRequest?: (name: string, value: unknown) => void;
  addHook(
    name: "onRequest" | "preHandler",
    handler: (req: any, reply: any, done: HookDone) => void,
  ): void;
  addHook(
    name: "onSend",
    handler: (req: any, reply: any, payload: any, done: (err: unknown, payload?: any) => void) => void,
  ): void;
}

export function velumFastify(fastify: FastifyLike, opts: VelumFastifyOptions = {}): void {
  const { inCharacter = false, messageField = "message", messagesField = "messages", ...config } = opts;
  const velum = createVelum(config);

  try {
    fastify.decorateRequest?.("velum", null);
  } catch {
    // Already decorated — ignore.
  }

  fastify.addHook("onRequest", (req, _reply, done) => {
    req.velum = velum;
    done();
  });

  fastify.addHook("preHandler", (req, _reply, done) => {
    if (!velum.enabled) return done();
    const body = (req.body ?? {}) as Record<string, unknown>;

    const message = body[messageField];
    if (typeof message === "string") {
      const result = velum.classify(message);
      req.velumClassification = result;
      body[messageField] = result.sanitizedMessage;
    }

    const messages = body[messagesField];
    if (Array.isArray(messages)) {
      const ctx = velum.scanContext(messages as ContextScanInput[]);
      req.velumContextFlags = ctx.flags;
      if (ctx.redactedMessages) body[messagesField] = ctx.redactedMessages;
    }

    done();
  });

  fastify.addHook("onSend", (_req, _reply, payload, done) => {
    if (!velum.enabled) return done(null, payload);
    try {
      done(null, guardPayload(velum, payload, inCharacter));
    } catch {
      done(null, payload);
    }
  });
}

function guardPayload(velum: Velum, payload: unknown, inCharacter: boolean): unknown {
  if (typeof payload === "string") {
    // Try to guard JSON string payloads field-wise; fall back to raw text guard.
    const trimmed = payload.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(payload);
        return JSON.stringify(guardObject(velum, parsed, inCharacter));
      } catch {
        // Not JSON — guard as plain text.
      }
    }
    return velum.applyOutputGuard(payload, { inCharacter }).text;
  }
  return payload;
}

function guardObject(velum: Velum, payload: unknown, inCharacter: boolean): unknown {
  if (typeof payload === "string") return velum.applyOutputGuard(payload, { inCharacter }).text;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = { ...(payload as Record<string, unknown>) };
    for (const key of ["text", "content", "message", "response", "output"]) {
      if (typeof obj[key] === "string") {
        obj[key] = velum.applyOutputGuard(obj[key] as string, { inCharacter }).text;
      }
    }
    return obj;
  }
  return payload;
}
