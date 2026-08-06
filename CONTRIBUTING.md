# Contributing to Pipe Nativo

Thanks for wanting to help. This is the React Native / Expo mobile client for [Pipe](https://pipe.one). It talks to *your own* hub — there is no shared backend, nothing is hardcoded.

## Running it locally

```bash
npm install
npx expo start          # dev server; Expo Go works for the JS-only parts
```

At login, enter your **hub URL** and **PIN**. See the [README](README.md) for the full feature tour.

Native modules (`llama.rn`, `whisper.rn`, video trim, etc.) don't run in Expo Go. For those you need a dev/EAS build:

```bash
npx expo prebuild
eas build --profile development       # or: npx expo run:android | run:ios
```

The APK build flow and on-device-AI setup are documented in [README.md](README.md) and [SETUP-LOCALAI.md](SETUP-LOCALAI.md). The generated `android/` and `ios/` folders are git-ignored on purpose — regenerate them with `expo prebuild`, don't commit them.

## Checks before you push

```bash
npm run lint            # ESLint (flat config, ESLint 9)
npm run format:check    # Prettier — must pass
npm test                # Jest (jest-expo)
```

CI runs `expo-doctor`, lint and tests on every PR.

## Code style

Plain JavaScript (no TypeScript). Prettier owns formatting — the repo style is:

- **no semicolons**
- **double quotes**
- **2-space** indentation
- generous line width (compact one-liners are common and fine)

Run `npm run format:check` (or your editor's Prettier integration) before committing. Keep comments in the surrounding language of the file (much of the codebase is commented in Spanish — that's intentional).

## Tests

Unit tests live in `__tests__/`. Prefer testing **pure logic** that needs no native mocks (helpers in `src/util.js`, the merge/dedup logic, the in-memory secret-session state). Add a test alongside any pure helper you change.

## Pull requests

1. Branch off `main`.
2. Keep PRs focused and small. One concern per PR.
3. Make sure `lint`, `format:check` and `test` pass.
4. Describe **what** changed and **why**. Screenshots or a short screen recording help a lot for UI changes.
5. Never commit secrets, keystores, `google-services.json`, `GoogleService-Info.plist`, personal hub URLs, phone numbers or tokens. The `.gitignore` covers the usual suspects — double-check your diff anyway.

## Reporting bugs

Open an issue with steps to reproduce, your platform (iOS/Android + version) and the Expo SDK. For **security** issues, do **not** open a public issue — see [SECURITY.md](SECURITY.md).
