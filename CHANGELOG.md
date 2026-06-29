# Changelog

## v0.2.2 — Public release

- Public npm release as `velum-ai`
- Pipeline API: `guardRequest` / `guardResponse` wire all three stages in two calls
- Streaming output guard: `createOutputStreamGuard` for SSE-safe secret detection
- Guarded tool calls: `guardToolCall` with credential buffer hand-off
- Presets + shareable pattern packs (`velum init --preset <product>`)
- Audit log with `velum audit tail` / `velum audit summary`
- `--explain` flag for plain-English pattern descriptions
- Framework adapters: Fastify, Express, generic
- CLI: `scan`, `test`, `init`, `audit`
- Zero runtime dependencies

## v0.1.0 — Initial release

- Three-stage trust boundary (input, context, output)
- Credential detection and redaction with single-use buffer
- PII masking (emails, phones, SSNs, credit cards, IPs, names)
- Prompt injection detection
- Framework adapters (Fastify, Express, generic)
- CLI for standalone scanning
- Zero runtime dependencies
