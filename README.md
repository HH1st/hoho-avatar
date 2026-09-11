# Hoho Avatar

Hoho Avatar is an open-source toolkit for building speaking and audio-reactive avatar experiences across rendering engines.

**[Try the live microphone and local audio demo](https://hh1st.github.io/hoho-avatar/)**

![Niu Lai reacting to voice with Hoho Avatar](https://raw.githubusercontent.com/HH1st/hoho-avatar/main/docs/images/niu-lai-talking.gif)

Click **Try a sample** in the live demo to see Niu Lai react immediately—no microphone permission or audio file required.

![Hoho Avatar Studio with its charcoal and coral interface, character cards, and voice controls](https://raw.githubusercontent.com/HH1st/hoho-avatar/main/docs/images/niu-lai-demo.png)

_The redesigned Avatar Studio: a charcoal stage, coral accents, character cards, and four voice modes._

The project currently ships a browser-first TypeScript engine that analyzes streaming PCM audio, selects five mouth states, adds automatic blinking, and renders layered PNG characters with Canvas 2D. The demo accepts microphone input, a local audio file, locally generated English speech from KittenTTS, or an optional Azure Realtime voice-agent session. Local audio analysis, file decoding, and KittenTTS stay in the browser; Voice Agent mode explicitly sends microphone audio to the configured Azure OpenAI resource.

The SDK includes optional Three.js and Live2D renderers through the same renderer interface. Run `npm run dev` and select **Mochi (3D)** in the same Studio to try the Blender-built 3D character. See the [3D guide](docs/THREE.md) and [Live2D integration](docs/LIVE2D.md). Other engines remain roadmap items.

## Use the SDK

**`@hh1st/hoho-avatar`** is a framework-independent SDK with ESM, TypeScript declarations, no required runtime dependencies, and an included original Pixel Bot character. Version `0.1.0-beta.3` adds explicit renderer selection with Canvas, Three.js and Live2D entries. Three.js and Live2D require their optional peers; Live2D Core and model assets are supplied separately.

```bash
npm install @hh1st/hoho-avatar@next --registry=https://registry.npmjs.org
```

To use the published earlier API, install `@hh1st/hoho-avatar@0.1.0-beta.1`. To build a local tarball from source, run `npm install` and `npm pack` in this repository, then install the generated `.tgz` in your application.

```ts
import { createAvatar } from "@hh1st/hoho-avatar";
import { canvasRenderer } from "@hh1st/hoho-avatar/canvas";
import pixelBot from "@hh1st/hoho-avatar/characters/pixel-bot";

const avatar = await createAvatar(canvas, { renderer: canvasRenderer({ character: pixelBot }) });

// Call from a click/tap handler.
startButton.onclick = () => {
  void avatar.startMicrophone().catch(console.error);
};
stopButton.onclick = () => avatar.stopAudio();

// Or: await avatar.playAudio(fileOrUrl);
// Or: avatar.pushPCM(chunk, 24_000);
// When removing the canvas: await avatar.destroy();
```

See the [SDK guide](docs/SDK.md) for file playback, PCM/TTS integration, framework lifecycle, asset hosting and API details. The [quickstart application](https://github.com/HH1st/hoho-avatar/tree/main/examples/sdk-quickstart) imports only the installed package; the tarball test runs it without access to repository source.

## Try it in 60 seconds

Requirements: Node.js 20.19 or newer and npm.

```bash
git clone https://github.com/HH1st/hoho-avatar.git
cd hoho-avatar
npm install
npm run setup:demo
npm run dev
```

Open the URL shown by Vite and press **Try a sample**. Everything runs locally in the browser.

The single Studio in `examples/basic/` imports the checked-out SDK source. Select a 2D character or **Mochi (3D)** in the same character library; microphone, files, TTS and voice conversations share the same controls. Three.js is loaded only when selecting a 3D character. GitHub Pages builds this same Studio. Run `npm run setup:quickstart` to build and install the current tarball in the isolated quickstart.

## Built for voice agents

Hoho Avatar sits after your audio source: feed it mono PCM from a realtime model, text-to-speech engine, WebSocket, microphone, or prerecorded clip. The rendering layer does not depend on a specific AI provider, so it works well for:

- Browser voice-agent interfaces
- Local assistants and companion apps
- Game dialogue and NPC prototypes
- Streaming overlays and interactive demos

## What is included

| Part | Location | Purpose |
| --- | --- | --- |
| Canvas 2D engine | `src/` | PCM analysis, mouth classification, blinking, asset loading, and Canvas rendering |
| Demo and assets | `examples/basic/`, `public/characters/` | Microphone and local-file playback with three engine-ready example characters |
| Asset Skill | `skills/generate-talking-sprite-character/` | A Codex workflow for generating, validating, previewing, and integrating character assets |

The bundled example characters are:

- `niu-lai` — the default reference-guided orange bovine character.
- `pixel-bot` — the retro robot character.
- `pixel-portrait` — a front-facing pixel-art portrait.

See [ASSETS.md](https://github.com/HH1st/hoho-avatar/blob/main/ASSETS.md) for their licensing and provenance notes.

## Run from source

Select a character and press **Start microphone** for live input, **Try a sample** for the bundled demo clip, **Choose audio** to decode and play a local audio file, or use **Local TTS** to synthesize English speech. Microphone access normally requires localhost or a secure HTTPS context. KittenTTS requires WebGPU and downloads its Nano model on first use. The demo also serves the complete English phonemizer dictionary locally because the current npm package omits its runtime data assets.

### Load a custom character

The demo accepts a `.zip` containing one V1 2D character directory, or an embedded `.glb` 3D model. Select **Import avatar** or drop the archive onto the avatar stage; the package is validated, unpacked, and rendered entirely inside the browser.

Imports are limited to 25 MB compressed, 75 MB of extracted character files, and 1,024 archive entries. Sizes are checked before and during extraction; duplicate asset paths are rejected.

```text
my-character.zip
└── my-character/
    ├── character.json
    ├── body.png
    ├── eyes-open.png
    ├── eyes-closed.png
    └── mouth-{closed,small,large,wide,round}.png
```

Characters produced by the bundled [asset-generation Skill](https://github.com/HH1st/hoho-avatar/blob/main/skills/generate-talking-sprite-character/SKILL.md) follow this layout. Zip the generated character directory before loading it in the demo. The files are not uploaded to a server.

Use the SDK package for integration. The browser studio and optional Azure gateway remain runnable from source; they are not included in the SDK package.

## One Avatar API, renderer implementations

The package root contains the renderer-neutral createAvatar, Avatar, MotionController and audio tools. Canvas and Three.js implement the same AvatarRenderer contract and are selected explicitly:

```ts
import { createAvatar } from '@hh1st/hoho-avatar';
import { canvasRenderer } from '@hh1st/hoho-avatar/canvas';
// For 3D, import { threeRenderer } from '@hh1st/hoho-avatar/three';

const avatar = await createAvatar(canvas, {
  renderer: canvasRenderer({ character: '/characters/pixel-bot/character.json' }),
  // Or: renderer: threeRenderer({ model: '/models/mochi/mochi.glb' }),
  sampleRate: 48_000,
});
avatar.pushPCM(float32Chunk);
const unsubscribe = avatar.onMotion(frame => console.log(frame.mouth));
// await avatar.startMicrophone();
// await avatar.playAudio(fileOrUrl);
// avatar.stopAudio();
// unsubscribe(); await avatar.destroy();
```

Both implementations return the same Avatar. Read capabilities for supported expressions and view controls. The core has no renderer dependency; Canvas consumers do not install Three.js. The Three.js implementation requires the optional three peer. See [the SDK guide](docs/SDK.md) for the interface and [the Blender/Three.js guide](docs/THREE.md) for GLB authoring.

MotionController consumes mono PCM and produces RenderFrame, including mouth/energy, blink, interaction state and timing. Renderers draw those frames and manage their own assets/GPU resources. Audio acquisition and playback remain separate; match the processing sample rate when supplying external PCM.

### Drive an avatar from streaming TTS text

`StreamingTTSPlayer` accepts complete text or text deltas, groups them into short speakable phrases, starts playback as soon as the first phrase is ready, synthesizes later phrases while audio is playing, and sends playback PCM through the same avatar input. Supply any synthesizer that returns a browser-decodable audio `Blob`:

```ts
import { StreamingTTSPlayer } from "@hh1st/hoho-avatar";
import { textToSpeech } from "kitten-tts-webgpu";

const tts = new StreamingTTSPlayer({
  synthesize: (text, options) => textToSpeech(text, {
    model: "nano",
    voice: options.voice,
    speed: options.speed,
    onProgress: options.onProgress,
  }),
  voice: "Bella",
  onPCM: (chunk) => avatar.pushPCM(chunk),
});

// Call prepare() from a click/tap to unlock Web Audio.
await tts.prepare();

// Feed deltas from a streaming model response.
tts.write("Hello! ");
tts.write("This sentence can be synthesized while more text arrives. ");
tts.flush();

// Interrupt playback and discard pending text/audio.
tts.stop();
```

KittenTTS currently supports English only. It produces one WAV per phrase rather than raw audio frames; `StreamingTTSPlayer` provides low-latency queued playback, not model-native streaming synthesis.

The demo exposes two playback policies. **SMOOTH** calls `speakComplete()` and waits for one complete synthesis so playback cannot underrun. **FAST START** calls `speak()` and begins after the first short phrase, but may pause if the current device synthesizes slower than audio plays.

KittenTTS does not expose cancellation for an in-flight WebGPU generation. `stop()` immediately silences and clears scheduled playback, then reports `stopping` until the current synthesis call returns. New synthesis is rejected during that interval so GPU jobs cannot overlap and corrupt playback state.

### Azure Realtime voice agent

The demo can also run a full-duplex voice conversation through Azure OpenAI Realtime. The browser connects only to the included gateway; the gateway obtains an Entra token through Managed Identity and never exposes it to browser code. Copy `.env.example` to `.env` and set `AZURE_OPENAI_DOMAIN` and `AZURE_OPENAI_REALTIME_DEPLOYMENT` to your own Azure resource and deployment.

The gateway runtime uses three continuously running asynchronous loops separated by two queues. The Input Loop normalizes browser and Realtime events into the input queue; the Process Loop transforms those events and places browser-facing events in the output queue; the Output Loop independently delivers audio, transcript, and interruption events. Each response is tagged with a generation so output arriving after an interruption is discarded. The browser remains a thin input/output adapter, and avatar rendering only consumes the PCM that is actually played.

Give the deployed identity the Azure OpenAI inference role for the resource, then start the frontend and gateway together:

```bash
npm run dev:all
```

The launcher checks gateway health before starting Vite and reuses an already running gateway. Ctrl+C stops the services it owns. The frontend defaults to port 5173 (override with `PORT`); its gateway proxy follows `VOICE_AGENT_HOST` and `VOICE_AGENT_PORT` from `.env`. You can still run `npm run dev` and `npm run dev:voice-agent` separately.

Production uses system-assigned Managed Identity by default. Set `AZURE_CLIENT_ID` for a user-assigned identity. For local development only, copy `.env.example` to `.env`, set `AZURE_USE_DEFAULT_CREDENTIAL=1`, and authenticate with `az login`; this mode uses `AzureCliCredential` explicitly. Set `VOICE_AGENT_ALLOWED_ORIGINS` to the deployed site origin before exposing the gateway publicly.

Local Vite development connects through the built-in `/voice-agent` proxy. Static production builds, including the GitHub Pages demo, disable the Voice Agent tab unless `VITE_VOICE_AGENT_URL` is explicitly set to a deployed `wss://` gateway URL.

Calling `VuiClient.disconnect()` or `destroy()` while `connect()` is pending rejects that promise with an `AbortError`. Treat it as an intentional cancellation; a disconnected client can connect again immediately. Messages from the previous socket are ignored.

Session setup has a 30-second deadline (`connectTimeoutMs` can override it). The demo checks local gateway health, permits cancellation during authentication or microphone permission, and releases capture and playback on disconnect or failure. **RETRY CONNECTION** starts a new conversation; previous conversation history is not restored. The speaking indicator stays active until queued audio finishes, and **INTERRUPT** immediately stops local playback while notifying the gateway.

The package entry point exports:

- `createAvatar`, `Avatar` and `AvatarOptions`
- `MicrophoneInput`

- `MotionController`, `AvatarRenderer` and `RendererFactory`
- `PCMAnalyzer`
- `MouthClassifier`
- `AudioClipPlayer`
- `AudioQueuePlayer`
- `StreamingTTSPlayer` and `takeTTSChunks`
- `VuiClient` and `StreamingPCMPlayer`
- `parseSpriteCharacterDefinition` from `/canvas` for validating sprite JSON
- TypeScript definitions for character configuration, audio features, mouth states, and motion frames

## Character asset format

Each character is a directory containing one body image, optional eye layers, five required mouth layers, and a `character.json` file:

```text
my-character/
├── body.png
├── eyes-open.png
├── eyes-closed.png
├── mouth-closed.png
├── mouth-small.png
├── mouth-large.png
├── mouth-wide.png
├── mouth-round.png
└── character.json
```

The renderer draws layers in this order:

```text
body -> eyes -> mouth
```

Minimal configuration:

```json
{
  "version": 1,
  "canvas": { "width": 512, "height": 512 },
  "body": {
    "src": "body.png",
    "x": 0,
    "y": 0,
    "width": 512,
    "height": 512
  },
  "mouth": {
    "anchor": { "x": 256, "y": 338 },
    "sprites": {
      "closed": "mouth-closed.png",
      "small": "mouth-small.png",
      "large": "mouth-large.png",
      "wide": "mouth-wide.png",
      "round": "mouth-round.png"
    }
  },
  "eyes": {
    "anchor": { "x": 256, "y": 256 },
    "sprites": {
      "open": "eyes-open.png",
      "closed": "eyes-closed.png"
    }
  },
  "animation": { "bodyBouncePx": 2 }
}
```

Image paths are resolved relative to `character.json`. Anchors are the center points of their corresponding transparent PNG layers. See [the complete V1 format guidance](https://github.com/HH1st/hoho-avatar/blob/main/skills/generate-talking-sprite-character/references/character-format.md) for details.

## Generate an asset with Codex

The repository includes the reusable `generate-talking-sprite-character` Skill. It supports both reference-guided and text-only generation.

From a reference:

```text
Use $generate-talking-sprite-character from skills/generate-talking-sprite-character
to create a pixel-art avatar from this reference image and add it to the demo.
```

Without a reference:

```text
Use $generate-talking-sprite-character from skills/generate-talking-sprite-character
to create a friendly pixel-art astronaut cat that can speak, validate the full
eye-and-mouth state matrix, and add it to the demo.
```

The Skill guides Codex through body generation, style-aware eyes and mouth states, configuration, complete state-matrix review, validation, and optional demo integration. Its helper scripts require Python 3 and Pillow:

```bash
python -m pip install -r skills/generate-talking-sprite-character/requirements.txt
```

Image generation also requires an ImageGen capability when a character body does not already exist.

## Development

```bash
npm run setup:demo # Install the demo dependencies from its lockfile
npm run dev        # Start the unified 2D/3D Studio from source
npm run typecheck  # Type-check source, examples, and tests
npm run lint       # Check JS/TS correctness with Oxlint
npm test           # Run deterministic engine and audio-player tests
npm run build      # Build the demo into examples/basic/dist
npm run build:sdk  # Build SDK ESM, declarations and assets
npm run test:package # Install and test the SDK tarball in an independent app
```

Browser regression tests use Chromium with synthetic microphone input and a simulated gateway; they do not contact Azure or require credentials:

```bash
npx playwright install chromium
npm run test:e2e
```

These tests cover repeated start/end, cancellation, delayed permissions, connection loss and retry, playback interruption, natural playback completion, and provider switching. CI runs both the unit suite and the browser suite. Real Azure, device microphone, and WebGPU TTS behavior still require integration testing on the target device.

Project layout:

```text
src/
├── animation/   # Blink timing
├── audio/       # PCM feature extraction and mouth classification
├── audio-source/ # Local-file playback and AudioWorklet PCM output
├── core/        # Avatar API, renderer contracts and shared motion
├── canvas/      # Sprite format, assets and painting
└── three/       # GLB loading and morph rendering

examples/basic/  # Browser microphone demo
public/characters/
├── niu-lai/
├── pixel-bot/
└── pixel-portrait/

skills/generate-talking-sprite-character/
├── SKILL.md
├── references/
├── scripts/
└── assets/

docs/
└── BACKLOG.md      # Remaining release and renderer work
```

### Architecture

The engine keeps media acquisition, motion analysis, and drawing as separate stages:

```text
microphone / audio file / TTS
              |
              v
        mono Float32 PCM
              |
              v
 PCMAnalyzer -> MouthClassifier -> MotionController -> AvatarRenderer (Canvas / Three.js)
                                      |
                               BlinkController
```

`audio-source/` owns browser playback and emits PCM without depending on avatar rendering. `audio/` is DOM-independent signal processing. `core/` defines renderer-neutral orchestration. `canvas/` owns the sprite format, validation, image loading and painting; `three/` owns GLB rendering. Keep new integrations on these boundaries: audio providers should emit PCM, classifiers should emit `MotionFrame`, and renderers should consume motion rather than control playback.

## Privacy and browser support

The engine processes PCM data in the browser. Local microphone visualization and selected audio files are not uploaded. When the user explicitly starts Voice Agent mode, the example streams microphone audio through the Managed Identity gateway to the configured Azure OpenAI Realtime deployment and renders the returned audio transcript.

Applications embedding the engine remain responsible for how they acquire, store, or transmit audio outside the engine.

The engine targets modern browsers with Canvas 2D, `fetch`, and `requestAnimationFrame`. Microphone capture requires `getUserMedia` and `AudioWorklet`; the SDK source emits mono PCM in 20 ms batches from the audio rendering thread, with local monitoring muted. Local-file playback requires `decodeAudioData` and `AudioWorklet`.

## Current scope and roadmap

Current release:

- Browser Canvas 2D rendering
- Mono PCM input
- Local audio-file playback with mono PCM output
- Five heuristic mouth states: `closed`, `small`, `large`, `wide`, and `round`
- Automatic two-state blinking
- Layered PNG character assets

The current engine is not phoneme-level lip sync, a skeletal animation system, or a general-purpose audio recording library.

The source includes Three.js and Live2D adapters consuming shared audio-driven motion. Three.js uses GLB morph targets; Live2D uses Cubism parameters. Skeletal retargeting and other renderer integrations remain future work.

SDK packaging and consumer validation are implemented. Preview releases use the public npm `next` tag; see [release instructions](https://github.com/HH1st/hoho-avatar/blob/main/docs/RELEASING.md) and [remaining work](https://github.com/HH1st/hoho-avatar/blob/main/docs/BACKLOG.md).

## Contributing and security

See [CONTRIBUTING.md](https://github.com/HH1st/hoho-avatar/blob/main/CONTRIBUTING.md) before opening a pull request. Report security-sensitive issues according to [SECURITY.md](https://github.com/HH1st/hoho-avatar/blob/main/SECURITY.md).

## License

The browser demo distributes [third-party notices](https://hh1st.github.io/hoho-avatar/third-party-notices.html), full license texts, and pinned source references alongside its assets. These notices cover fflate, KittenTTS, Phonemizer.js and eSpeak data/backend components. They are separate from the standalone SDK, which has no runtime npm dependencies.

Hoho Avatar is available under the [MIT License](LICENSE). The engine source, bundled Skill, documentation, and included example assets are covered unless a file states otherwise. See [ASSETS.md](https://github.com/HH1st/hoho-avatar/blob/main/ASSETS.md) for asset-specific notes.
