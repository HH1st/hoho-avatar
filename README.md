# Hoho Avatar

Hoho Avatar is an open-source toolkit for building speaking and audio-reactive avatar experiences across rendering engines.

**[Try the live microphone and local audio demo](https://hh1st.github.io/hoho-avatar/)**

![Niu Lai reacting to voice with Hoho Avatar](docs/images/niu-lai-talking.gif)

Click **TRY SAMPLE VOICE** in the live demo to see Niu Lai react immediately—no microphone permission or audio file required.

![Hoho Avatar demo with Niu Lai as the default talking character](docs/images/niu-lai-demo.png)

_The browser demo with Niu Lai loaded as the default audio-reactive avatar._

The project currently ships a browser-first TypeScript engine that analyzes streaming PCM audio, selects five mouth states, adds automatic blinking, and renders layered PNG characters with Canvas 2D. The demo accepts microphone input, a local audio file, or locally generated English speech from KittenTTS. Audio analysis, file decoding, and the demo TTS path stay in the browser without speech recognition, transcription, or a cloud service.

Support for additional 2D, Live2D, and 3D renderers is a long-term direction, not a feature of the current release.

## Try it in 60 seconds

Requirements: Node.js 20.19 or newer and npm.

```bash
git clone https://github.com/HH1st/hoho-avatar.git
cd hoho-avatar
npm install
npm run dev
```

Open the URL shown by Vite and press **TRY SAMPLE VOICE**. Everything runs locally in the browser.

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

See [ASSETS.md](ASSETS.md) for their licensing and provenance notes.

## Run from source

Select a character and press **START MIC** for live input, **TRY SAMPLE VOICE** for the bundled demo clip, **CHOOSE AUDIO** to decode and play a local audio file, or use **LOCAL TTS // KITTEN** to synthesize English speech. Microphone access normally requires localhost or a secure HTTPS context. KittenTTS requires WebGPU and downloads its Nano model on first use. The demo also serves the complete English phonemizer dictionary locally because the current npm package omits its runtime data assets.

### Load a custom character

The demo accepts a `.zip` containing one V1 character directory. Select **LOAD AVATAR ZIP** or drop the archive onto the avatar stage; the package is validated, unpacked, and rendered entirely inside the browser.

```text
my-character.zip
└── my-character/
    ├── character.json
    ├── body.png
    ├── eyes-open.png
    ├── eyes-closed.png
    └── mouth-{closed,small,large,wide,round}.png
```

Characters produced by the bundled [asset-generation Skill](skills/generate-talking-sprite-character/SKILL.md) follow this layout. Zip the generated character directory before loading it in the demo. The files are not uploaded to a server.

Hoho Avatar is currently source-first and is not published as an npm package. Use the checked-out source directly or adapt the example application for your integration.

## Engine usage from source

The repository entry point is `src/index.ts`. For example, code inside `examples/basic/` imports the engine directly from the source tree and creates a sprite with a canvas, character definition, and PCM sample rate:

```ts
import { TalkingSprite } from "../../src";

const canvas = document.querySelector<HTMLCanvasElement>("#avatar")!;

const sprite = new TalkingSprite(canvas, {
  character: "/characters/niu-lai/character.json",
  sampleRate: 48_000,
});

await sprite.ready;
sprite.start();

// Push mono PCM chunks as they become available.
sprite.pushPCM(float32Chunk);
```

Subscribe to classified motion frames when the surrounding UI needs the current mouth state or energy level:

```ts
const unsubscribe = sprite.onMotion((frame) => {
  console.log(frame.mouth, frame.energy, frame.speaking);
});

// Later:
unsubscribe();
sprite.destroy();
```

### Drive a sprite from a local audio file

`AudioClipPlayer` decodes a complete browser-supported audio file, plays it through Web Audio, and emits mono `Float32Array` PCM chunks for `TalkingSprite`:

```ts
import { AudioClipPlayer, TalkingSprite } from "../../src";

const canvas = document.querySelector<HTMLCanvasElement>("#avatar")!;
const file = document.querySelector<HTMLInputElement>("#audioFile")!.files![0]!;
let sprite: TalkingSprite | undefined;

const player = new AudioClipPlayer({
  onPCM: (chunk) => sprite?.pushPCM(chunk),
  onEnded: () => sprite?.resetAudio(),
});

const metadata = await player.load(file);
sprite = new TalkingSprite(canvas, {
  character: "/characters/niu-lai/character.json",
  sampleRate: metadata.sampleRate,
});

await sprite.ready;
sprite.start();
await player.play();

// Later:
player.stop();
sprite.resetAudio();
await player.destroy();
sprite.destroy();
```

`metadata.sampleRate` is the Web Audio processing rate used by the emitted PCM, so pass it to `TalkingSprite`. Browsers automatically resample source files such as 16 kHz or 24 kHz audio to the `AudioContext` rate. Supported file containers and codecs depend on the browser.

### Drive a sprite from streaming TTS text

`StreamingTTSPlayer` accepts complete text or text deltas, groups them into short speakable phrases, starts playback as soon as the first phrase is ready, synthesizes later phrases while audio is playing, and sends playback PCM through the same avatar input. Supply any synthesizer that returns a browser-decodable audio `Blob`:

```ts
import { StreamingTTSPlayer, TalkingSprite } from "../../src";
import { textToSpeech } from "kitten-tts-webgpu";

const tts = new StreamingTTSPlayer({
  synthesize: (text, options) => textToSpeech(text, {
    model: "nano",
    voice: options.voice,
    speed: options.speed,
    onProgress: options.onProgress,
  }),
  voice: "Bella",
  onPCM: (chunk) => sprite.pushPCM(chunk),
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

The source entry point exports:

- `TalkingSprite`
- `PCMAnalyzer`
- `MouthClassifier`
- `AudioClipPlayer`
- `StreamingTTSPlayer` and `takeTTSChunks`
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

Image paths are resolved relative to `character.json`. Anchors are the center points of their corresponding transparent PNG layers. See [the complete V1 format guidance](skills/generate-talking-sprite-character/references/character-format.md) for details.

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
npm run dev        # Start the browser demo from source
npm run typecheck  # Type-check source, examples, and tests
npm test           # Run deterministic engine and audio-player tests
npm run build      # Build the browser demo
```

Project layout:

```text
src/
├── animation/   # Blink timing
├── audio/       # PCM feature extraction and mouth classification
├── audio-source/ # Local-file playback and AudioWorklet PCM output
├── core/        # TalkingSprite API and public types
└── renderer/    # Asset loading and Canvas composition

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
└── BACKLOG.md      # Deferred packaging and renderer work
```

## Privacy and browser support

The engine processes PCM data in the browser. It does not transcribe speech or upload audio. The example application requests microphone access only after the user presses the microphone button, and selected audio files are decoded locally without being uploaded.

Applications embedding the engine remain responsible for how they acquire, store, or transmit audio outside the engine.

The engine targets modern browsers with Canvas 2D, `fetch`, and `requestAnimationFrame`. The microphone path additionally requires `getUserMedia` and currently uses the legacy `ScriptProcessorNode`. Local-file playback requires `decodeAudioData` and `AudioWorklet`.

## Current scope and roadmap

Current release:

- Browser Canvas 2D rendering
- Mono PCM input
- Local audio-file playback with mono PCM output
- Five heuristic mouth states: `closed`, `small`, `large`, `wide`, and `round`
- Automatic two-state blinking
- Layered PNG character assets

The current engine is not phoneme-level lip sync, a skeletal animation system, or a general-purpose audio recording library.

Longer term, Hoho Avatar aims to expose shared audio-driven motion data to multiple renderer adapters, including richer 2D, Live2D, and 3D integrations. Those adapters are not yet implemented.

Packaging, release automation, dependency reproducibility, and renderer expansion are tracked in [docs/BACKLOG.md](docs/BACKLOG.md).

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report security-sensitive issues according to [SECURITY.md](SECURITY.md).

## License

Hoho Avatar is available under the [MIT License](LICENSE). The engine source, bundled Skill, documentation, and included example assets are covered unless a file states otherwise. See [ASSETS.md](ASSETS.md) for asset-specific notes.
