import { test } from "node:test";
import assert from "node:assert/strict";

import { velumHealthCheck } from "../src/health.js";

test("velumHealthCheck returns status ok", () => {
  const result = velumHealthCheck();
  assert.equal(result.status, "ok");
});

test("velumHealthCheck returns service velum", () => {
  const result = velumHealthCheck();
  assert.equal(result.service, "velum");
});

test("velumHealthCheck returns stable shape", () => {
  const result = velumHealthCheck();
  assert.deepEqual(result, { status: "ok", service: "velum" });
});
