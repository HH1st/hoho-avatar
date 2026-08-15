# Hoho Avatar

Hoho Avatar is an open-source toolkit for building speaking and audio-reactive avatar experiences across rendering engines.

**[Try the live microphone demo](https://hh1st.github.io/hoho-avatar/)**

The project currently ships a browser-first TypeScript engine that analyzes streaming PCM audio, selects five mouth states, adds automatic blinking, and renders layered PNG characters with Canvas 2D. The engine has no runtime dependencies and performs its audio analysis locally without speech recognition, transcription, or a cloud service.

Support for additional 2D, Live2D, and 3D renderers is a long-term direction, not a feature of the current release.

## What is included

| Part | Location | Purpose |
| --- | --- | --- |
| Canvas 2D engine | `src/` | PCM analysis, mouth classification, blinking, asset loading, and Canvas rendering |
| Demo and assets | `examples/basic/`, `public/characters/` | A microphone demo with two engine-ready example characters |
| Asset Skill | `skills/generate-talking-sprite-character/` | A Codex workflow for generating, validating, previewing, and integrating character assets |

The bundled example characters are:

- `pixel-bot` — the default retro robot character.
- `pixel-portrait` — a front-facing pixel-art portrait.

See [ASSETS.md](ASSETS.md) for their licensing and provenance notes.

## Run from source

Requirements: Node.js 20.19 or newer and npm.

```bash
git clone https://github.com/HH1st/hoho-avatar.git
cd hoho-avatar
npm install
npm run dev
```

Open the local URL shown by Vite, select a character, press **START MIC**, and grant microphone permission. Microphone access normally requires localhost or a secure HTTPS context.

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
  character: "/characters/pixel-bot/character.json",
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

The source entry point exports:

- `TalkingSprite`
- `PCMAnalyzer`
- `MouthClassifier`
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
npm test           # Run deterministic analyzer and classifier tests
npm run build      # Build the browser demo
```

Project layout:

```text
src/
├── animation/   # Blink timing
├── audio/       # PCM feature extraction and mouth classification
├── core/        # TalkingSprite API and public types
└── renderer/    # Asset loading and Canvas composition

examples/basic/  # Browser microphone demo
public/characters/
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

The engine processes PCM data in the browser. It does not transcribe speech or upload audio. The example application requests microphone access only after the user presses the microphone button.

Applications embedding the engine remain responsible for how they acquire, store, or transmit audio outside the engine.

The engine targets modern browsers with Canvas 2D, `fetch`, and `requestAnimationFrame`. The microphone demo additionally requires `getUserMedia`. It currently uses the legacy `ScriptProcessorNode`; production integrations may prefer `AudioWorklet`.

## Current scope and roadmap

Current release:

- Browser Canvas 2D rendering
- Mono PCM input
- Five heuristic mouth states: `closed`, `small`, `large`, `wide`, and `round`
- Automatic two-state blinking
- Layered PNG character assets

The current engine is not phoneme-level lip sync, a skeletal animation system, or an audio capture library.

Longer term, Hoho Avatar aims to expose shared audio-driven motion data to multiple renderer adapters, including richer 2D, Live2D, and 3D integrations. Those adapters are not yet implemented.

Packaging, release automation, dependency reproducibility, and renderer expansion are tracked in [docs/BACKLOG.md](docs/BACKLOG.md).

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report security-sensitive issues according to [SECURITY.md](SECURITY.md).

## License

Hoho Avatar is available under the [MIT License](LICENSE). The engine source, bundled Skill, documentation, and included example assets are covered unless a file states otherwise. See [ASSETS.md](ASSETS.md) for asset-specific notes.
