# @kittymi/openclaw-generic-http

[![npm version](https://img.shields.io/npm/v/@kittymi/openclaw-generic-http)](https://www.npmjs.com/package/@kittymi/openclaw-generic-http)
[![license](https://img.shields.io/npm/l/@kittymi/openclaw-generic-http)](./LICENSE)
[![node](https://img.shields.io/node/v/@kittymi/openclaw-generic-http)](https://nodejs.org/)

> [中文版](./README.md)

An OpenClaw `generic-http` channel plugin. Connects third-party systems to OpenClaw through an HTTP bridge/relay using webhook ingress + stream pull topology.

## Features

### Channel Capabilities

| Capability | Status | Description |
| --- | --- | --- |
| `health` | Supported | Bridge health check |
| `probe` | Supported | Instance reachability and config diagnostics |
| `resolve` | Supported | Conversation/user/group directory resolution |
| `capabilities` | Supported | Capability declaration and negotiation |
| Inbound (webhook + stream) | Supported | Third-party webhook write → plugin stream pull |
| Outbound | Supported | OpenClaw reply → plugin sends to bridge |
| Stream long-polling | Supported | `waitSeconds` polling + `lastEventId` cursor ack |

### Message Types

| Type | Inbound | Outbound |
| --- | --- | --- |
| Plain text | Supported | Supported |
| Single image attachment | Supported | Supported |
| Single file attachment | Supported | Supported |
| Text + image | Supported | Supported |
| Text + file | Supported | Supported |
| Mixed attachments | Supported | Supported |

### Security

| Mechanism | Status | Description |
| --- | --- | --- |
| HMAC-SHA256 signing | Supported | Outbound request signing + inbound webhook verification |
| Nonce replay protection | Supported | In-memory/LRU nonce deduplication |
| API Key auth | Supported | Shared credential, optional separate inbound/outbound secrets |
| Idempotency key | Supported | `idempotencyKey` to prevent duplicate delivery |

### Runtime

| Feature | Status | Description |
| --- | --- | --- |
| Multi-account | Supported | Independent stream connections per `accountId` |
| Auto-reconnect | Supported | Backoff retry on stream disconnect |
| Structured errors | Supported | Plugin pull/dispatch/ack errors include `errorCode` |
| Config diagnostics | Supported | `readyForStream` / `readyForOutbound` status exposed |

## Architecture

```
Third-party System       Bridge/Relay              This Plugin             OpenClaw
─────────────────       ────────────              ───────────             ────────
webhook ──→ POST /webhooks/inbound/messages ──→ GET /stream/inbound ──→ channel event
                                                ←── POST /stream/acks  ←──
         ←── POST /outbound/messages           ←── outbound send       ←── agent reply
```

- This plugin **does not expose a public port** — inbound is pulled via stream
- Third-party systems **do not connect directly to OpenClaw** — they write webhooks to the bridge/relay
- Signing, verification, and route mapping all happen inside the plugin — **no dependency on OpenClaw internals**

## Compatibility

| Dimension | Baseline | Status |
| --- | --- | --- |
| Plugin version | `0.1.6` | Current release |
| OpenClaw | `2026.5.x` | Supported release line |
| OpenClaw | `2026.5.12 (f066dd2)` | Verified locally |
| Node.js | `>=22.16.0` | Engine requirement |
| Node.js | `22.x` / `24.x` | Verified in CI + local |
| Protocol | `generic-http protocol v1` | Alignment baseline |
| Platform | `clawbridge-platform 0.1.2` | Shared integration baseline |

Not supported:
- OpenClaw `2026.4.x` and earlier — not verified, no compatibility commitment
- OpenClaw `2026.6.x` and later — not yet verified, to be evaluated separately

See [Compatibility Matrix](./docs/05-compatibility-matrix.md) for details.

## Quick Start

```bash
# 1. Install
openclaw plugins install @kittymi/openclaw-generic-http

# 2. Add config to openclaw.json (see Configuration Reference below)

# 3. Verify
openclaw channels list --all
openclaw channels status --channel generic-http
```

### Minimum Verification Path

```
1. bridge GET /health
2. bridge POST /probe
3. Plugin POST /outbound/messages
4. Third-party writes POST /webhooks/inbound/messages
5. Plugin stream consume and ack
```

Or run the bundled E2E regression script:

```bash
npm run test:e2e
```

## Installation

**Recommended: OpenClaw plugin mechanism**

```bash
openclaw plugins install @kittymi/openclaw-generic-http
```

**Local development:**

```bash
openclaw plugins link /path/to/openclaw-generic-http
```

**Global install (alternative, not preferred):**

```bash
npm install -g @kittymi/openclaw-generic-http
```

See [Installation Guide](./docs/01-installation-guide.md) for details.

## Configuration Reference

### Minimal Config

```json
{
  "channels": {
    "generic-http": {
      "enabled": true,
      "defaultAccount": "online_001",
      "accounts": {
        "online_001": {
          "baseUrl": "https://bridge.example.com",
          "apiKey": "replace-me",
          "signingSecret": "replace-me"
        }
      }
    }
  }
}
```

### Top-level Fields

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | Yes | `false` | Whether the channel is enabled |
| `defaultAccount` | string | Yes | — | Default account, must exist in `accounts` |
| `accounts` | object | Yes | — | Per-account config keyed by `accountId` |

### Account Fields

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `baseUrl` | string (URI) | Yes | — | Bridge/relay base URL |
| `apiKey` | string | No | — | Shared API authentication credential |
| `signingSecret` | string | No | — | Secret for signing stream/probe/outbound requests |
| `inboundSecret` | string | No | — | Dedicated inbound webhook signing secret |
| `outboundSecret` | string | No | — | Dedicated outbound signing secret |
| `connectTimeoutMillis` | number | No | `5000` | HTTP connect timeout in milliseconds |
| `readTimeoutMillis` | number | No | `10000` | HTTP read timeout in milliseconds |
| `maxRetries` | number | No | `0` | Max retries for retryable outbound failures |

### Configuration Constraints

- `defaultAccount` must reference a real key under `accounts`
- One account config maps to one platform `accountId`
- Sharing the same account config across multiple OpenClaw nodes is discouraged
- Do not use placeholder names like `default` as production account keys

## Bridge API Endpoints

The plugin interoperates with any bridge/relay implementing `generic-http protocol v1`:

| Endpoint | Method | Purpose | Caller |
| --- | --- | --- | --- |
| `/health` | GET | Health check | Plugin |
| `/probe` | POST | Instance reachability and config diagnostics | Plugin |
| `/resolve` | POST | Conversation/user/group directory lookup | Plugin |
| `/capabilities` | POST | Capability declaration and negotiation | Plugin |
| `/webhooks/inbound/messages` | POST | Inbound message ingestion | Third-party system |
| `/stream/inbound` | GET | Inbound event streaming (SSE) | Plugin |
| `/stream/acks` | POST | Inbound event acknowledgement | Plugin |
| `/outbound/messages` | POST | Outbound message delivery | Plugin |

## Local Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run unit tests
npm test

# Pack check
npm run pack:check

# End-to-end regression (requires local bridge)
npm run test:e2e
```

See [Local Development Guide](./docs/03-local-dev.md) for details.

## Known Limitations

- Compatibility is formally declared only for OpenClaw Desktop `2026.5.x`
- Real-machine verification completed only on `2026.5.12 (f066dd2)`
- `openclaw channels add --channel ...` relies on a static catalog; third-party channels may not appear in interactive enumeration
- Multi-version OpenClaw compatibility matrix not yet covered
- Rich media is limited to image and file attachments — no cards, buttons, or interactive components
- Multi-account parallelism and reconnect backoff still to be optimized (see [Next Phase Plan](./docs/04-next-phase-plan.md))

## Documentation

| Doc | Description |
| --- | --- |
| [Installation Guide](./docs/01-installation-guide.md) | Install methods, minimal config, first-time integration |
| [FAQ](./docs/02-faq.md) | Frequently asked questions and troubleshooting |
| [Local Development](./docs/03-local-dev.md) | Local dev environment and integration setup |
| [Next Phase Plan](./docs/04-next-phase-plan.md) | `0.2.x` roadmap |
| [Compatibility Matrix](./docs/05-compatibility-matrix.md) | Version compatibility and alignment baseline |
| [Release Checklist](./docs/06-release-checklist.md) | Pre-release verification items |
| [Release Notes Policy](./docs/07-release-notes-policy.md) | CHANGELOG and release note conventions |

Upstream collaboration:
- [clawbridge-platform](https://github.com/KittyMi/openclaw-http-bridge) — Protocol docs and shared test vectors

## Open Source

- [MIT License](./LICENSE)
- [Contributing](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security](./SECURITY.md)

Run `npm run build && npm test && npm run pack:check && npm run test:e2e` before submitting changes.
