# Security Policy

## Scope

This repository maintains the `openclaw-generic-http` OpenClaw channel plugin.

Please report issues here when they affect:

- plugin request signing or signature verification
- webhook or stream request validation
- outbound delivery behavior
- route mapping behavior
- host adapter or plugin lifecycle wiring
- plugin configuration parsing or normalization

## Reporting a vulnerability

If you believe you found a security vulnerability, report it privately first.

Please do not open a public issue, discussion, or pull request for an
unpatched vulnerability, exploit path, secret, or proof of concept.

Preferred disclosure path:

1. Open a private GitHub Security Advisory for this repository, if enabled.
2. If private advisories are not available, contact the repository owner or
   organization through the contact information published on GitHub.

Include:

1. affected component
2. impact
3. reproduction steps
4. environment and version information
5. remediation suggestion, if you have one

Reports with a clear reproduction path and demonstrated impact are triaged
faster.

## Out of scope

The following are usually not treated as plugin security issues by themselves
unless they show a concrete boundary bypass or real impact:

- missing hardening advice without an exploitable path
- issues that require changing the published protocol signing rules
- platform-side issues that live only in `openclaw-http-bridge`
- expected behavior from a trusted-installed plugin running with host access

## Coordination with the platform repository

This plugin is designed to work with the external
`openclaw-http-bridge` platform repository. If an issue lives only in the
platform implementation or its docs, report it there instead of here.
