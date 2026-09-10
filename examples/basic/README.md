# Avatar Studio

This demo consumes the published `@hh1st/hoho-avatar@0.1.0-beta.1` from npm. Its own package manifest and lockfile keep it separate from the SDK repository package. SDK imports resolve to this example’s `node_modules/`, with no source alias, local tarball, or SDK build step.

From this directory:

```bash
npm ci --registry=https://registry.npmjs.org
npm run dev
```

Open the URL printed by Vite. `npm run build` checks types and creates `dist/`; `npm run preview` serves that production build.

Use the **sun / moon** icons in the header to choose warm daylight or the original dark studio. The first visit follows the system appearance; a manual selection is saved in this browser. Add `?theme=morning` or `?theme=night` to preview or share a specific appearance. Both themes share the same characters, voice controls and mobile layout; switching keeps the current audio session running.

The demo needs only this directory and the shared `../../public/` artwork, audio and TTS assets. The Pages workflow checks out exactly those directories and installs this lockfile. Optional voice-agent configuration is read from the repository-level environment; its gateway can be started separately with `npm run dev:voice-agent` at the repository root.

To upgrade the SDK, install an explicitly chosen published version here with `npm install --save-exact @hh1st/hoho-avatar@<version>` and commit both `package.json` and `package-lock.json`.
