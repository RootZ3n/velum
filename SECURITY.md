# Security and Limitations

Velum is a zero-dependency AI privacy and injection defense library. It
provides pattern-based detection — not cryptographic security or formal
verification.

## Detection Approach

Velum uses regex patterns and heuristics to detect credentials, PII, and
prompt injection. It is designed to produce explainable findings and reduce
accidental leakage, not to catch every possible secret or unsafe instruction.

## Credential Buffer

Detected credentials are redacted from the model's view and stored in a
short-lived single-use buffer so tools can still retrieve them. The buffer
is in-memory only and does not persist across process restarts.

## PII Masking

PII detection uses reversible masking by default. Masked values can be
unmasked by the originating process. Do not assume Velum's masking meets
regulatory compliance requirements (HIPAA, GDPR, etc.) without additional
review.

## Injection Detection

Velum flags potential prompt injection attempts using pattern matching.
It cannot guarantee detection of novel or sophisticated injection vectors.
Use Velum as one layer in a defense-in-depth strategy, not as the sole
protection.

## No Runtime Dependencies

Velum ships with zero runtime dependencies. All detection logic is
self-contained. This reduces supply chain risk but means detection
patterns must be updated by upgrading the Velum package itself.

## Framework Adapters

Velum provides adapters for Fastify, Express, and generic use. Adapters
intercept at the HTTP layer. If your application uses a different transport
(protocol buffers, WebSockets, etc.), use the core functions directly.
