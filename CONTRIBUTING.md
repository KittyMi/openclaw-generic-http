# Contributing

## Scope

This repository only maintains the `openclaw-generic-http` plugin.

It is responsible for:

- channel transport
- inbound request validation
- outbound delivery
- signing and signature verification
- route mapping
- OpenClaw host integration

It is not the place for:

- platform backend code
- platform frontend code
- third-party business workflow logic

## Before you start

Before submitting implementation changes, please confirm:

1. the change still follows `generic-http protocol v1`
2. signing, timestamp, nonce, and route semantics were not accidentally changed
3. the plugin still stays within transport, mapping, security, and host integration scope
4. behavior changes are covered by tests or docs

For protocol-facing changes, also check alignment with:

- `openclaw-http-bridge/docs/02-protocol-v1.md`
- `openclaw-http-bridge/docs/06-security-spec.md`
- `openclaw-http-bridge/docs/08-session-routing-spec.md`
- shared vectors under `openclaw-http-bridge/docs/test-vectors/`

## Development expectations

Please keep changes easy to review:

- prefer small pull requests
- do not casually rename public config keys, manifest fields, or payload fields
- do not silently drift from the platform repository docs
- update README when install, config, compatibility, or runtime behavior changes
- update changelog for user-visible release work

Major design changes should start with an issue or discussion.

## Validation

Run the relevant checks before opening a pull request:

```bash
npm run build
npm test
npm run pack:check
npm run test:e2e
```

If a change affects OpenClaw compatibility, note the exact OpenClaw version and
Node.js version you used.

If you could not run one of the checks, say so clearly in the pull request.

## Pull request checklist

Please include:

1. what changed
2. why the change was needed
3. what you tested
4. whether compatibility notes, docs, or examples changed

## Security issues

Do not open a public issue for an unpatched vulnerability.

Use `SECURITY.md` and report the issue privately first.
