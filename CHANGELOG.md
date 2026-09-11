# Changelog

## Unreleased

- Replace the short audio sample with a complete English greeting.
- Frame the Live2D sample around its artwork and show a rendered character portrait in the Studio picker. Reset view restores the larger framing.
- Enable the Live2D sample on GitHub Pages using checksum-verified official assets, same-origin URLs, retained notices and production-browser smoke tests. SDK contents remain unchanged.

## 0.1.0-beta.3 — 2026-09-11

- Isolate Cubism/Pixi internals behind a private Live2D runtime port; retain the common SDK renderer contract and Demo behavior.
- Add a Live2D renderer entry with optional PixiJS/Cubism display dependencies, shared state/mouth mapping and unified Studio selection. Core and model assets are not bundled.
- Fix exception-safe audio teardown, cancellable avatar/file startup and renderer failure recovery through a shared error contract.
- Preserve character assets and camera across audio changes; separate CharacterStage and StudioAudio from page wiring.
- Share AudioRuntime/AudioOutput infrastructure and combine mouth states mapped to the same GLB target.
- Rename Canvas-specific character types/helpers and zero-crossing audio heuristics.
- Make quickstart install the current SDK tarball using its real manifest via setup:quickstart.
- Define CharacterState constants, the derived type, CHARACTER_STATES and isCharacterState once in core; validate setState and explicitly map voice-session states in the Studio.
- Add Oxlint correctness checks to local development, CI and SDK publishing; remove unsafe finally returns and fix TTS cancellation during final audio decoding.
- Define MouthState runtime constants, the derived type, ordered MOUTH_STATES and isMouthState once in core; share them across classification, both renderers, character validation and Studio previews.
- Breaking source API: one renderer-neutral createAvatar/Avatar API with explicit canvasRenderer or threeRenderer injection. Remove renderer-specific avatar classes/factories; both implementations expose the same lifecycle, capabilities and view-control contract.
- Share one MotionController for PCM analysis, mouth classification, blinking and animation scheduling across Canvas and Three.js.
- Merge 2D and 3D into the same Studio, character picker and four audio providers, with lazy Three.js loading and a source-based Pages build.
- Add an optional Three.js SDK entry with GLB morph-target animation, shared audio ownership, orbit controls and resource disposal.
- Add Blender Mochi source and GLB, expression previews and model import to the Studio.

## 0.1.0-beta.2 — 2026-09-10

- Move SDK microphone capture from `ScriptProcessorNode` to `AudioWorklet`, using 20 ms mono PCM batches and preserving muted monitoring and cancellation cleanup.
- Reject pending microphone setup promptly on disposal, including while a worklet module is still downloading.
- Add a warm Morning appearance alongside Night, with a persistent theme switch and shareable theme URLs.
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
