# SDK integration

The SDK is framework-independent ESM with TypeScript declarations. It installs no runtime dependencies, injects no UI or CSS, and does not connect to an AI service. Rendering uses Canvas 2D and five heuristic mouth states; this is not phoneme-level lip sync.

## Install the preview

```bash
npm install @hh1st/hoho-avatar@next --registry=https://registry.npmjs.org
```

The current preview version is `0.1.0-beta.2`. Pin that exact version for reproducible application builds. The 0.1.x API is early; minor versions may introduce breaking changes.

For a local source build, run `npm install` and `npm pack` in the repository, then install `/path/to/hh1st-hoho-avatar-0.1.0-beta.2.tgz` in your application.

## First avatar

```html
<canvas id="avatar" style="width: 320px; image-rendering: pixelated"></canvas>
<button id="mic">Start microphone</button>
<button id="stop">Stop</button>
```

```ts
import { createAvatar } from "@hh1st/hoho-avatar";
import pixelBot from "@hh1st/hoho-avatar/characters/pixel-bot";

const avatar = await createAvatar(
  document.querySelector<HTMLCanvasElement>("#avatar")!,
  { character: pixelBot },
);

document.querySelector("#mic")!.addEventListener("click", () => {
  void avatar.startMicrophone().catch(console.error);
});
document.querySelector("#stop")!.addEventListener("click", () => avatar.stopAudio());

// When removing the canvas (for example, in component cleanup):
// await avatar.destroy();
```

Creation waits for all character images and starts rendering. It neither creates an AudioContext nor requests microphone permission. Call audio-starting methods inside a click/tap handler to satisfy autoplay policies. Microphone access requires HTTPS or localhost.

The included Pixel Bot is original MIT artwork. Other demo characters, TTS models, dictionaries, recordings and Azure gateway code are not shipped in the package.

## Public API

| API | Behavior |
| --- | --- |
| `createAvatar(canvas, options)` | Resolves to a ready, rendering `Avatar`. `character` is required; `sampleRate` defaults to 48,000. |
| `avatar.startMicrophone()` | Starts local mono capture. Resolves after permission and capture setup; replaces prior owned audio. |
| `avatar.playAudio(urlOrBlobOrArrayBuffer)` | Loads, decodes and plays a file. Resolves to audio metadata when playback starts. Automatically matches the decoded processing rate. |
| `avatar.stopAudio()` | Immediately cancels startup, silences playback, releases microphone tracks and closes the mouth. AudioContext close completes asynchronously. |
| `avatar.pushPCM(chunk, sampleRate?)` | Pushes mono `Float32Array` or `Int16Array` from an external source. Call `stopAudio()` before switching from owned playback/capture. |
| `avatar.onMotion(listener)` | Subscribes to motion frames; returns an unsubscribe function. |
| `avatar.getMotionFrame()` | Reads the latest classified frame. |
| `avatar.destroy()` | Cancels audio, stops drawing, clears the canvas and awaits owned audio cleanup. Safe to call repeatedly. |

`playAudio()` and `startMicrophone()` replace the previous operation. A replaced/cancelled startup rejects with `AbortError`; handle that as intentional cancellation. Other failures reject with the original error. URL fetches obey CORS.

Since `0.1.0-beta.2`, `MicrophoneInput` uses the shared audio worklet to emit 20 ms mono `Float32Array` packets at the `AudioContext` sample rate. Its output is muted locally. Worklet module loading is part of setup; cancellation and setup failures release acquired tracks and close the context. The PCM callback and network sending still run on the main thread. The studio's pinned `0.1.0-beta.1` dependency does not include this migration yet.

`TalkingSprite`, `PCMAnalyzer`, `MouthClassifier`, `AudioClipPlayer`, `AudioQueuePlayer`, `StreamingTTSPlayer`, `StreamingPCMPlayer`, `VuiClient`, `MicrophoneInput` and their option types remain available for lower-level integrations. `TalkingSprite.setSampleRate(rate)` resets analysis without reloading images. `setState()` currently stores state; it does not add expressive state animations.

## AI / TTS integration

For a provider that already plays audio, feed PCM at its playback cadence:

```ts
const avatar = await createAvatar(canvas, { character: pixelBot, sampleRate: 24_000 });
const unsubscribe = provider.onPlayedAudio((pcm: Int16Array) => avatar.pushPCM(pcm));
// On interruption/end: avatar.stopAudio();
// On teardown: unsubscribe(); await avatar.destroy();
```

Do not push an entire recording at once: the avatar renders the most recent frame. `StreamingPCMPlayer` and `StreamingTTSPlayer` emit PCM from their playback worklet so the avatar follows audible audio. They do not stop an external provider for you. Keep API keys and cloud authentication on your server.

## Custom characters and asset hosting

Pass the URL of a V1 `character.json`, with images stored beside it, or a validated `CharacterDefinition` containing image URLs. A relative image path in a JSON file resolves relative to that JSON URL. Paths in an object resolve against the document base URI.

The bundled robot entry contains asset URLs relative to its ESM module. Vite production builds copy those assets automatically. The SDK worklet is a separate `audio-clip-processor.js` file, not an inline blob; retain it beside `index.js` if serving the package directly. Native browser ESM and Vite builds on a nested base path are covered by the package consumer test. Other bundlers should preserve `new URL(..., import.meta.url)` asset references.

For a plain browser app, serve the installed `dist-sdk/` folder over HTTP(S) and import `index.js` and `characters/pixel-bot.js` by URL, or map those URLs using an import map. Opening files through `file://` is unsupported. A same-origin deployment needs no `blob:` or `data:` permission for worklet scripts.

## Framework lifecycle

Create after a canvas mounts; destroy when it unmounts. In React effects, handle the possibility that loading completes after cleanup:

```tsx
useEffect(() => {
  let disposed = false;
  let instance: Avatar | undefined;
  void createAvatar(canvasRef.current!, { character: pixelBot }).then((avatar) => {
    if (disposed) void avatar.destroy();
    else instance = avatar;
  }).catch(console.error);
  return () => { disposed = true; void instance?.destroy(); };
}, []);
```

Do not construct the avatar during server rendering. Importing the package on the server is safe, but constructing the avatar and audio players requires browser APIs.

## Validation and release

The main studio in `examples/basic/` is an independent npm application with its own package manifest and lockfile. It installs `@hh1st/hoho-avatar@0.1.0-beta.1` from the public npm registry, and imports only the installed package. The quickstart also installs a versioned package from npm.

Run `npm run setup:demo` after installing repository dependencies. `npm run dev`, `npm run dev:all`, and `npm run build` use the installed SDK; the demo output is `examples/basic/dist/`. The GitHub Pages job checks out only `examples/basic/` and `public/`, installs the same lockfile, and builds without SDK source. Changes to `src/` affect the demo only after publishing a new SDK version and updating the demo dependency and lockfile. `npm run build:sdk` and `npm pack` remain separate SDK development commands.

`npm run test:package` builds and inspects the tarball, installs it into a fresh consumer, checks NodeNext types and server-side import, then runs native ESM and Vite production browser checks for character loading, audio-worklet PCM, microphone capture and disposal. See [RELEASING.md](https://github.com/HH1st/hoho-avatar/blob/main/docs/RELEASING.md) before publishing.
