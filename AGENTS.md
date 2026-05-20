# AGENTS.md

## Project

Repository name: `openclaw-generic-http`

This repository maintains the OpenClaw `generic-http` channel plugin.

It is the plugin-side companion to the local platform repository:

- Platform repository: `D:\openclaw-http-bridge`
- Plugin repository: `D:\openclaw-generic-http`

The plugin is intended to be published as an open source package. Keep config,
runtime behavior, packaging, and docs clean enough for external users.

## Source of truth

When a change affects protocol behavior, signing, routing, or compatibility,
read these first:

1. `D:\openclaw-http-bridge\docs\02-protocol-v1.md`
2. `D:\openclaw-http-bridge\docs\06-security-spec.md`
3. `D:\openclaw-http-bridge\docs\08-session-routing-spec.md`
4. `D:\openclaw-http-bridge\docs\15-version-matrix.md`

Shared vectors live under:

- `D:\openclaw-http-bridge\docs\test-vectors\`

If implementation and docs diverge, either:

- update the plugin implementation to match the shared docs, or
- explicitly update the shared docs in the platform repository in the same work
  stream if the design intentionally changed

Do not silently drift.

## Repository layout

- `src/`
  Plugin runtime, transport, mapping, signing, and host integration logic
- `scripts/`
  Local verification scripts
- `docs/`
  Plugin installation, FAQ, and local development docs

## Scope rules

This repository is responsible for:

- channel transport
- inbound request validation
- outbound delivery
- signature verification and signing
- route mapping
- OpenClaw host lifecycle integration
- plugin packaging and release metadata

It is not responsible for:

- platform backend code
- platform frontend code
- third-party business workflow orchestration
- long-term external system state management

## Implementation rules

### General

- Prefer small, reviewable changes.
- Keep ASCII unless the file already needs another character set.
- Do not introduce speculative abstractions unless they remove real duplication.
- Do not casually rename public config keys, schema fields, manifest fields, or
  protocol-facing payload fields.

### Protocol and security

- Keep protocol behavior aligned with the shared docs in
  `D:\openclaw-http-bridge\docs\`.
- Preserve field names and semantics once introduced.
- Signature behavior must remain aligned with
  `docs/06-security-spec.md`.
- Never implement signing based on reserialized JSON if raw body bytes are
  required.

### Platform coordination

- If a plugin change also requires shared doc, vector, or compatibility updates,
  make the corresponding change in `D:\openclaw-http-bridge`.
- Do not copy platform implementation code into this repository.
- Keep README, changelog, and compatibility statements aligned with the platform
  repository version matrix.

## Testing expectations

Before claiming a behavior is complete, prefer covering:

- signature and verification paths
- timestamp and nonce validation
- routing behavior
- idempotency behavior
- stream pull / ack / reconnect behavior
- OpenClaw compatibility notes when host-facing behavior changes

## Local validation

Run the relevant checks before release-sensitive changes are considered done:

```bash
npm run build
npm test
npm run pack:check
npm run test:e2e
```

If a task also affects the shared platform behavior, run the corresponding
platform-side checks in `D:\openclaw-http-bridge` as needed.

## Git and workflow

- Do not commit unless explicitly asked.
- Do not rewrite or remove release notes or compatibility statements unless the
  design intentionally changed.
- Keep changes scoped to the plugin repository unless the task explicitly spans
  both repositories.

## Release workflow

- `CHANGELOG.md` should reflect actual shipped plugin progress.
- `package.json`, `openclaw.plugin.json`, README compatibility notes, and npm
  packaging checks should stay aligned.
