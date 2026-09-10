# Changelog

## Unreleased

- Run Avatar Studio as an independent npm application using the published SDK and its own lockfile.
- Build GitHub Pages from the example and shared demo assets without checking out SDK source.
- Add separate demo setup instructions and document local SDK package testing.

## 0.1.0-beta.1 — SDK preview

- Framework-independent ESM, TypeScript declarations and source maps.
- `createAvatar()` with local microphone capture, audio-file playback, PCM input and cleanup.
- Original Pixel Bot character through `@hh1st/hoho-avatar/characters/pixel-bot`.
- Separate demo/library builds, no runtime npm dependencies, and native-browser/Vite tarball consumer tests.
- Existing low-level audio analysis, playback and gateway client APIs remain exported.
- Preview releases use the npm `next` dist-tag.
