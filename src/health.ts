/**
 * Velum — AI Privacy & Injection Defense
 * ============================================================
 * Health-check utility. Provides a simple liveness/readiness probe.
 * ============================================================
 */

export interface HealthCheckResult {
  status: "ok";
  service: "velum";
}

/**
 * Returns a simple health-check result indicating that the Velum module
 * is alive and operational.
 */
export function velumHealthCheck(): HealthCheckResult {
  return { status: "ok", service: "velum" };
}
