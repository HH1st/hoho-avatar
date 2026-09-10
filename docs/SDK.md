# SDK integration

The SDK is framework-independent ESM with TypeScript declarations. The core entry has no renderer dependency, injects no UI or CSS, and does not connect to an AI service. Canvas and Three.js implement the same interface. Only the Three.js implementation requires its optional peer. Both use five heuristic mouth states; this is not phoneme-level lip sync.

## Install the preview

```bash
npm install @hh1st/hoho-avatar@next --registry=https://registry.npmjs.org
```

The API below is unreleased source. Use a local tarball to try it. Published beta.1 uses the earlier API; beta.2 registry publication is pending. Both renderer implementations now require explicit selection.

For a local source build, run `npm install` and `npm pack` in the repository, then install `/path/to/hh1st-hoho-avatar-0.1.0-beta.2.tgz` in your application.

## First avatar

```html
<canvas id="avatar" style="width: 320px; image-rendering: pixelated"></canvas>
<button id="mic">Start microphone</button>
<button id="stop">Stop</button>
```

```ts
import { createAvatar } from "@hh1st/hoho-avatar";
import { canvasRenderer } from "@hh1st/hoho-avatar/canvas";
import pixelBot from "@hh1st/hoho-avatar/characters/pixel-bot";

const avatar = await createAvatar(
  document.querySelector<HTMLCanvasElement>("#avatar")!,
  { renderer: canvasRenderer({ character: pixelBot }) },
);

document.querySelector("#mic")!.addEventListener("click", () => {
  void avatar.startMicrophone().catch(console.error);
});
document.querySelector("#stop")!.addEventListener("click", () => avatar.stopAudio());

// When removing the canvas (for example, in component cleanup):
// await avatar.destroy();
```

Creation waits for the chosen renderer and its character assets and starts rendering. It neither creates an AudioContext nor requests microphone permission. Call audio-starting methods inside a click/tap handler to satisfy autoplay policies. Microphone access requires HTTPS or localhost.

The included Pixel Bot is original MIT artwork. Other demo characters, TTS models, dictionaries, recordings and Azure gateway code are not shipped in the package.

## Public API

| API | Behavior |
| --- | --- |
| `createAvatar(canvas, options)` | Resolves to a ready, rendering `Avatar`. `renderer` is required; `sampleRate` defaults to 48,000. |
| `avatar.startMicrophone()` | Starts local mono capture. Resolves after permission and capture setup; replaces prior owned audio. |
| `avatar.playAudio(urlOrBlobOrArrayBuffer)` | Loads, decodes and plays a file. Resolves to audio metadata when playback starts. Automatically matches the decoded processing rate. |
| `avatar.stopAudio()` | Immediately cancels startup, silences playback, releases microphone tracks and closes the mouth. AudioContext close completes asynchronously. |
| `avatar.pushPCM(chunk, sampleRate?)` | Pushes mono `Float32Array` or `Int16Array` from an external source. Call `stopAudio()` before switching from owned playback/capture. |
| `avatar.onMotion(listener)` | Subscribes to motion frames; returns an unsubscribe function. |
| `avatar.getMotionFrame()` | Reads the latest classified frame. |
| `avatar.destroy()` | Cancels audio, stops drawing, clears the canvas and awaits owned audio cleanup. Safe to call repeatedly. |

`playAudio()` and `startMicrophone()` replace the previous operation. A replaced/cancelled startup rejects with `AbortError`; handle that as intentional cancellation. Other failures reject with the original error. URL fetches obey CORS.

Since `0.1.0-beta.2`, `MicrophoneInput` uses the shared audio worklet to emit 20 ms mono `Float32Array` packets at the `AudioContext` sample rate. Its output is muted locally. Worklet module loading is part of setup; cancellation and setup failures release acquired tracks and close the context. The PCM callback and network sending still run on the main thread. The Studio now imports local SDK source, so it includes this migration.

## One interface, two implementations

Character interaction states follow the same shared-definition pattern as mouth states:

~~~ts
import { CharacterState, CHARACTER_STATES, isCharacterState } from '@hh1st/hoho-avatar';

avatar.setState(CharacterState.Thinking);
if (isCharacterState(value)) avatar.setState(value);
// CHARACTER_STATES: idle, listening, thinking, speaking
~~~

CharacterState provides immutable runtime constants and a derived string-union type. Avatar, MotionController and every RenderFrame use that type; setState rejects unknown values at runtime. Existing string values remain valid. Connection and audio lifecycle states belong to their adapters; the Studio explicitly maps VoiceSessionState to CharacterState instead of passing transport states into renderers. Choosing a character state does not itself start audio or a network operation.

Mouth states are defined once in the core and exported as both runtime constants and a string-union type. Classification, character validation, renderer capabilities, morph mapping and Studio controls all use this definition:

~~~ts
import { MouthState, MOUTH_STATES, isMouthState } from '@hh1st/hoho-avatar';

avatar.previewMouth(MouthState.Round);
const supported = MOUTH_STATES.filter(state => avatar.capabilities.mouth.includes(state));
// At JSON/UI boundaries, narrow unknown values before passing them to the SDK.
if (isMouthState(value)) avatar.previewMouth(value);
~~~

The values remain closed, small, large, wide and round, preserving existing JSON/asset names. MouthState is an immutable enum-style object with a derived type; MOUTH_STATES is its immutable ordered value list. Renderers do not define their own mouth enums. Blender shape-key names such as mouth_round are renderer mappings, not new states.

The package root exports the common Avatar, createAvatar, MotionController, audio primitives and renderer contracts. It imports neither renderer. The /canvas and /three entries export factories with the same RendererFactory signature:

```ts
import { createAvatar } from '@hh1st/hoho-avatar';
import { canvasRenderer } from '@hh1st/hoho-avatar/canvas';
import { threeRenderer } from '@hh1st/hoho-avatar/three';

const a = await createAvatar(canvasA, {
  renderer: canvasRenderer({ character: '/characters/pixel-bot/character.json' }),
});
const b = await createAvatar(canvasB, {
  renderer: threeRenderer({ model: '/models/mochi/mochi.glb' }),
});
// a and b are both Avatar, with the same methods and lifecycle.
```

Only import the implementation your application uses. A Canvas consumer does not need to install Three.js; core and Canvas declarations do not reference its types. Both implementations have ready, capabilities, render, reset, resize, resetView, setViewControlEnabled and destroy. Capabilities report mouth targets, blinking and interactive view support; unsupported view controls are no-ops. Asset formats and constructor configuration differ, while runtime control stays uniform.

Avatar exposes capabilities, setState/getState, previewMouth/previewBlink, resize, resetView, setViewControlEnabled, start/stop and resetAudio alongside its audio methods. stop() pauses animation; stopAudio() releases owned audio. Previews work on both implementations. MotionController generates RenderFrame values and owns the only analysis, blink and animation loop.

Migration: select canvasRenderer({ character }) or threeRenderer({ model }) in the same createAvatar(canvas, { renderer }) call. The old TalkingSprite, TalkingModel and separate 3D avatar factory are replaced by explicit renderer injection. See [the 3D guide](THREE.md) for Blender authoring and model requirements.

## AI / TTS integration

For a provider that already plays audio, feed PCM at its playback cadence:

```ts
const avatar = await createAvatar(canvas, { renderer: canvasRenderer({ character: pixelBot }), sampleRate: 24_000 });
const unsubscribe = provider.onPlayedAudio((pcm: Int16Array) => avatar.pushPCM(pcm));
// On interruption/end: avatar.stopAudio();
// On teardown: unsubscribe(); await avatar.destroy();
```

Do not push an entire recording at once: the avatar renders the most recent frame. `StreamingPCMPlayer` and `StreamingTTSPlayer` emit PCM from their playback worklet so the avatar follows audible audio. They do not stop an external provider for you. Keep API keys and cloud authentication on your server.

## Custom characters and asset hosting

Creation accepts signal (AbortSignal) and onError. Aborting before creation resolves releases renderer resources and rejects promptly; after successful creation, call destroy() for teardown. Rendering failures stop the animation loop and notify onError. After repairing a recoverable backend failure, start() can restart it. Renderer factories receive an optional RendererContext for asynchronous errors such as WebGL context loss. Errors in consumer callbacks cannot prevent owned resource teardown; destroy() reports cleanup callback errors after releasing resources.

SpriteCharacterDefinition, SpritePlacement and parseSpriteCharacterDefinition are Canvas-specific exports from @hh1st/hoho-avatar/canvas. They replace the former CharacterDefinition/parseCharacterDefinition names in the renderer-neutral core.

AudioFeatures uses estimatedFrequencyHz (derived from zero crossings) and roundnessScore (a 0..1 heuristic). These replace the misleading spectralCentroid and lowBandRatio names; the calculation does not measure a spectrum.

Pass the URL of a V1 `character.json`, with images stored beside it, or a validated `SpriteCharacterDefinition` containing image URLs. A relative image path in a JSON file resolves relative to that JSON URL. Paths in an object resolve against the document base URI.

The bundled robot entry contains asset URLs relative to its ESM module. Vite production builds copy those assets automatically. The SDK worklet is a separate `audio-clip-processor.js` file, not an inline blob; retain the complete `dist-sdk/` directory, including shared JavaScript chunks, if serving the package directly. Native browser ESM and Vite builds on a nested base path are covered by the package consumer test. Other bundlers should preserve `new URL(..., import.meta.url)` asset references.

For a plain browser app, serve the installed `dist-sdk/` folder over HTTP(S) and import `index.js` and `characters/pixel-bot.js` by URL, or map those URLs using an import map. Opening files through `file://` is unsupported. A same-origin deployment needs no `blob:` or `data:` permission for worklet scripts.

## Framework lifecycle

Create after a canvas mounts; destroy when it unmounts. In React effects, handle the possibility that loading completes after cleanup:

```tsx
useEffect(() => {
  let disposed = false;
  let instance: Avatar | undefined;
  void createAvatar(canvasRef.current!, { renderer: canvasRenderer({ character: pixelBot }) }).then((avatar) => {
    if (disposed) void avatar.destroy();
    else instance = avatar;
  }).catch(console.error);
  return () => { disposed = true; void instance?.destroy(); };
}, []);
```

Do not construct the avatar during server rendering. Importing the package on the server is safe, but constructing the avatar and audio players requires browser APIs.

## Validation and release

The single Studio in `examples/basic/` imports local SDK source for both renderers. The separate SDK quickstart is a package-consumer fixture used to verify native browser and bundler integration.

Run `npm run setup:demo` after installing repository dependencies. `npm run dev`, `npm run dev:all`, and `npm run build` use the checked-out SDK; the only Studio output is `examples/basic/dist/`. GitHub Pages builds the same source and supports both character types. `npm run build:sdk` and `npm pack` remain separate SDK distribution commands.

`npm run test:package` builds and inspects the tarball, installs it into a fresh consumer, checks NodeNext types and server-side import, then runs native ESM and Vite production browser checks for character loading, audio-worklet PCM, microphone capture and disposal. See [RELEASING.md](https://github.com/HH1st/hoho-avatar/blob/main/docs/RELEASING.md) before publishing.
