# Security Policy

## Reporting a vulnerability

Please report security issues **privately** — do **not** open a public GitHub issue.

- Use GitHub's **[Report a vulnerability](https://github.com/azweig/pipe-app/security/advisories/new)** (Security → Advisories) to open a private advisory, **or**
- email the maintainer at the address on the [azweig](https://github.com/azweig) GitHub profile.

Please include steps to reproduce, the platform (iOS/Android + version) and the Expo SDK. We'll acknowledge as soon as we can and coordinate a fix and disclosure timeline with you. Please give us reasonable time to release a fix before any public disclosure.

## Scope

This repository is the **mobile client only**. It has no backend of its own — it talks to *your* self-hosted Pipe hub. Server-side issues belong in the hub repo: [azweig/pipe](https://github.com/azweig/pipe).

## What the app stores

The app is privacy-first and single-tenant. On the device it keeps only what it needs to talk to your hub:

- **Session token (`sid`)** and your **access PIN** — stored in the OS secure store (`expo-secure-store`, i.e. Keychain / Keystore), used to re-auth on launch.
- **Hub URL** and **language** — stored in AsyncStorage (not secret).
- **Cached messages** — in a local SQLite DB, so threads open instantly offline.

The **second-PIN ("secret accounts") token is held only in memory** — it is written to the request headers while unlocked and is **never** persisted to AsyncStorage, SecureStore or SQLite. It is cleared on lock, on loss of focus (with a short grace/debounce), and after 5 minutes of inactivity. When a second PIN exists, secret messages are not cached locally. This mirrors the web and desktop clients.

No analytics or crash telemetry is sent to any third party. AI features run against **your** hub (or, optionally, fully **on-device**).

## WhatsApp / third-party ToS caveat

Pipe can bridge WhatsApp and other messaging networks through your hub. Using an unofficial bridge to connect a personal account **may violate the terms of service** of WhatsApp (and other providers) and could get that account limited or banned. This is a product/usage risk, **not** a vulnerability in this app — please don't file it as a security report. You are responsible for how you connect your own accounts.
