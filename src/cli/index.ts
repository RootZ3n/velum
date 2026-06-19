#!/usr/bin/env node
/**
 * Velum CLI — zero-dependency entry point (node:util parseArgs).
 *
 *   velum scan <path>     scan files/stdin for secrets, injection, PII
 *   velum test <input>    test a string against all patterns
 *   velum init            generate velum.config.yaml
 */

import { parseArgs } from "node:util";

import { runScan } from "./commands/scan.js";
import { runTest } from "./commands/test.js";
import { runInit } from "./commands/init.js";

const VERSION = "0.1.0";

const HELP = `Velum ${VERSION} — AI Privacy & Injection Defense

Usage:
  velum <command> [options]

Commands:
  scan <path>        Scan files (or stdin with '-') for credentials, injection, and PII
  test <input>       Test a string against all patterns (reads stdin if omitted)
  init               Generate a velum.config.yaml with documented defaults

Options:
  --json             Output machine-readable JSON (scan, test)
  --force            Overwrite an existing config (init)
  --out <path>       Output path for init (default: velum.config.yaml)
  -h, --help         Show this help
  -v, --version      Show version

Examples:
  velum scan ./src
  cat secrets.txt | velum scan -
  velum test "ignore all previous instructions"
  velum init --force
`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      out: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  if (values.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  const command = positionals[0];
  if (values.help || !command) {
    process.stdout.write(HELP);
    return command ? 0 : values.help ? 0 : 1;
  }

  switch (command) {
    case "scan":
      return runScan(positionals[1], { json: values.json });
    case "test":
      return runTest(positionals.slice(1).join(" ") || undefined, { json: values.json });
    case "init":
      return runInit({ force: values.force, path: values.out });
    default:
      process.stderr.write(`velum: unknown command '${command}'\n\n${HELP}`);
      return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`velum: ${(err as Error).message}\n`);
    process.exitCode = 1;
  });
