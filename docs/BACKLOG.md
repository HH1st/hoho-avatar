# Backlog

## Voice agent follow-ups

- move microphone capture from `ScriptProcessorNode` to a 20 ms `AudioWorklet`;
- add a production deployment example for the Managed Identity gateway;
- add tool-call handling and explicit tool authorization boundaries;
- add automatic reconnect and conversation restoration policies (manual retry starts a fresh session today);
- replace the browser-to-gateway WebSocket with WebRTC when the Azure deployment supports the required server-side control pattern.

The browser SDK builds independently from the demo. SDK previews use the public npm `next` tag.

## Package distribution

Implemented:

- `@hh1st/hoho-avatar` ESM, declarations, source maps and an explicit exports/files contract;
- `createAvatar()` for microphone, local files and external PCM;
- original MIT Pixel Bot assets, with no Azure or KittenTTS runtime dependencies;
- separate `dist-sdk/` and demo `dist/` output;
- clean tarball installation with native browser and Vite production verification;
- tag-driven trusted-publishing workflow, changelog and release guidance.

Release operations:

- configure the npm trusted publisher / GitHub npm environment for subsequent automated releases;
- review and authorize each version tag and registry publication;
- consider framework adapters and consumer checks for additional bundlers.

## Dependency reproducibility

Status: implemented for source development and CI. Revisit release snapshots when package publishing begins.

The repository commits a public-registry `package-lock.json`, and CI installs it with `npm ci` so builds resolve an auditable, reproducible dependency graph without internal registry URLs.

## Renderer expansion

Status: roadmap, not current functionality.

- define an engine-neutral motion-frame contract;
- separate audio analysis from renderer lifecycle;
- add adapter boundaries for richer 2D, Live2D, and 3D runtimes;
- define capability discovery for blink, mouth, expression, pose, and viseme support;
- add renderer-specific examples without coupling asset generation to one engine.
