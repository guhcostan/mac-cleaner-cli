# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Report vulnerabilities via [GitHub Security Advisories](https://github.com/guhcostan/mac-cleaner-cli/security/advisories/new).

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You can expect a response within **72 hours**. We'll work with you to understand the issue and coordinate a fix before public disclosure.

## Security Model

Mac Cleaner CLI is designed with security in mind:

- **100% offline** — no network requests, no telemetry, no analytics
- **No root required** — all operations run as the current user
- **Read before delete** — items are scanned and listed before any deletion
- **Open source** — all code is publicly auditable
- **Minimal dependencies** — only 5 runtime dependencies, all from trusted maintainers monitored via [Socket.dev](https://socket.dev/npm/package/mac-cleaner-cli)

## Scope

This policy covers the `mac-cleaner-cli` npm package and the source code in this repository.
