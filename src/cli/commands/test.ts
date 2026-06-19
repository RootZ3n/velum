/**
 * `velum test <input>` — test a string against all Velum patterns.
 * Shows what would be detected at input, context, output, and PII stages.
 */

import { classify } from "../../core/classify.js";
import { scanInput, scanOutput } from "../../core/guard.js";
import { scanPii } from "../../core/pii.js";

export interface TestOptions {
  json?: boolean;
}

export async function runTest(input: string | undefined, options: TestOptions = {}): Promise<number> {
  const text = input ?? (await readStdin());
  if (!text) {
    process.stderr.write("velum test: no input provided.\n");
    return 2;
  }

  // classify runs without the buffer so `velum test` never stashes a value.
  const classification = classify(text, undefined, { storeInBuffer: false });
  const input_ = scanInput(text);
  const output = scanOutput(text);
  const pii = scanPii(text).map((d) => ({ type: d.type, start: d.start, end: d.end }));

  const report = {
    classification: {
      classification: classification.classification,
      action: classification.action,
      patternsMatched: classification.patternsMatched,
      sanitizedMessage: classification.sanitizedMessage,
    },
    inputGuard: { decision: input_.decision, flags: input_.flags },
    outputGuard: { decision: output.decision, flags: output.flags },
    pii,
  };

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return decisionExit(input_.decision, output.decision);
  }

  process.stdout.write("\nVelum test\n──────────\n");
  process.stdout.write(`Classification : ${report.classification.classification} (${report.classification.action})\n`);
  if (classification.patternsMatched.length) {
    process.stdout.write(`Patterns       : ${classification.patternsMatched.join(", ")}\n`);
  }
  if (classification.action === "redacted") {
    process.stdout.write(`Sanitized      : ${classification.sanitizedMessage}\n`);
  }
  process.stdout.write(`Input guard    : ${input_.decision}${input_.flags.length ? ` [${input_.flags.join(", ")}]` : ""}\n`);
  process.stdout.write(`Output guard   : ${output.decision}${output.flags.length ? ` [${output.flags.join(", ")}]` : ""}\n`);
  if (pii.length) {
    const counts: Record<string, number> = {};
    for (const d of pii) counts[d.type] = (counts[d.type] ?? 0) + 1;
    process.stdout.write(`PII            : ${Object.entries(counts).map(([t, c]) => `${t}×${c}`).join(", ")}\n`);
  } else {
    process.stdout.write("PII            : none\n");
  }
  process.stdout.write("\n");

  return decisionExit(input_.decision, output.decision);
}

function decisionExit(input: string, output: string): number {
  return input === "block" || output === "block" ? 1 : 0;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
    process.stdin.on("error", () => resolve(data.trim()));
  });
}
