# Backlog

## Voice agent follow-ups

- add a production deployment example for the Managed Identity gateway;
- add tool-call handling and explicit tool authorization boundaries;
- add automatic reconnect and conversation restoration policies (manual retry starts a fresh session today);
- replace the browser-to-gateway WebSocket with WebRTC when the Azure deployment supports the required server-side control pattern.

Microphone capture has migrated to the shared 20 ms `AudioWorklet` in SDK source. The unified Studio imports local source and includes it.

The browser SDK builds independently from the demo. SDK previews use the public npm `next` tag.

## Package distribution

Implemented:

- `@hh1st/hoho-avatar` ESM, declarations, source maps and an explicit exports/files contract;
- `createAvatar()` for microphone, local files and external PCM;
- original MIT Pixel Bot assets, with no Azure or KittenTTS runtime dependencies;
- separate `dist-sdk/` and demo `examples/basic/dist/` output;
- clean tarball installation with native browser and Vite production verification;
- tag-driven trusted-publishing workflow, changelog and release guidance.

Release operations:

- configure the npm trusted publisher / GitHub npm environment for subsequent automated releases;
- review and authorize each version tag and registry publication;
- consider framework adapters and consumer checks for additional bundlers.

## Dependency reproducibility

Status: implemented for source development, the standalone demo and CI.

The repository and `examples/basic/` commit public-registry lockfiles. CI installs both with `npm ci`; the unified demo imports SDK source and the package-consumer tests independently verify tarball installs.

## Renderer expansion

Status: an initial Three.js adapter and Blender character are implemented in source (unreleased).

- implemented: one Avatar API with explicit renderer implementations, shared RenderFrame, renderer-independent audio owner, Three.js GLB mouth/blink targets, target capability discovery, and one Studio with 2D/3D character selection;
- implemented: original Blender source, reproducible export script, GLB and morph validation;
- remaining: wider renderer adapters, skeletal poses/visemes, VRM, and SDK release and deployment of the unified Studio.
