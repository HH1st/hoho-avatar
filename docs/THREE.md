# Three.js avatars

The optional `@hh1st/hoho-avatar/three` entry in `0.1.0-beta.3` renders a Blender GLB through Three.js, drives named mouth morph targets from the existing PCM classifier, and blinks automatically.

## Run the unified studio

```bash
npm ci
npm run setup:demo
npm run dev
```

Open `http://127.0.0.1:5173/hoho-avatar/` and choose **Mochi (3D)**. Try the sample, capture a local microphone, choose an audio file, preview mouth shapes, or import a self-contained GLB. Drag to orbit, scroll to zoom, and reset the camera with the circular arrow. Everything stays in the browser. `npm run build` builds the single `examples/basic/dist/` site.

The Studio imports local SDK source for both 2D and 3D. It lazy-loads the Three.js entry when selecting a 3D character. All four audio providers share the same controls and PCM path. GitHub Pages builds the same unified page; no separate 3D page or port is needed.

## Blender source

`assets/blender/mochi.blend` contains the original Mochi character, editable meshes, materials, shape keys, and a studio camera/light setup. `public/models/mochi/mochi.glb` is its runtime export (about 1.2 MB). Both are original project assets under the MIT license; no external model or texture is used.

Rebuild with Blender 4.5 LTS:

```bash
blender --background --python scripts/blender/create_mochi.py
```

The script saves the `.blend`, exports only the character to GLB, and renders a review image to `tmp/mochi-blender.png`. It replaces the generated source/model files.

## SDK integration

Install `@hh1st/hoho-avatar@next` and `three@^0.185.0` in your app, or build a local tarball with `npm pack`. TypeScript consumers also need `@types/three`. Three.js is an optional peer; the core and Canvas entries do not load or require it.

```ts
import { createAvatar } from '@hh1st/hoho-avatar';
import { threeRenderer } from '@hh1st/hoho-avatar/three';

const avatar = await createAvatar(canvas, {
  renderer: threeRenderer({ model: '/models/mochi/mochi.glb' }),
  onMotion: frame => console.log(frame.mouth),
});

// Call from user gestures.
startButton.onclick = () => void avatar.startMicrophone().catch(console.error);
stopButton.onclick = () => avatar.stopAudio();
// await avatar.playAudio(fileOrUrl);
// avatar.pushPCM(playedAudioChunk, 24_000);
// avatar.resetView();
// await avatar.destroy();
```

Both Canvas and Three.js use the same createAvatar() factory, Avatar class and AvatarRenderer interface. The core imports neither implementation. MotionController owns PCM analysis, classification, previews, blinking and scheduling; each renderer consumes RenderFrame and owns its graphics resources. MorphRig maps motion to Blender shape keys. Call avatar.destroy() to release owned audio, animation frames and renderer resources.

threeRenderer() and canvasRenderer() implement the same RendererFactory. Both support the same lifecycle and report supported features through avatar.capabilities. Their model formats and graphics engines differ, not their place in the SDK.

## Model contract

Pass signal and onError to createAvatar(), rather than threeRenderer(). Several mouth states may map to one model target such as jawOpen. MorphRig combines bindings by mesh and target index and smooths each target once per frame; iteration order does not change the result.

The shared core MouthState constants and MOUTH_STATES list define mouth semantics for both renderers. The Three.js adapter maps every non-closed state to mouth_ followed by that value, with Basis representing MouthState.Closed. Custom Blender names may override this mapping but do not create another enum.

Export a binary glTF 2.0 (`.glb`) with embedded materials/buffers/images. The front faces +Z, with +Y up. The renderer centers and scales the model into its stage. The demo caps imports at 25 MB. External resource URIs are rejected; Draco/KTX2 and VRM extensions are not configured.

| Blender shape key | Behavior |
| --- | --- |
| Basis | Rest / closed mouth |
| `mouth_small` | Small opening |
| `mouth_large` | Large opening |
| `mouth_wide` | Wide opening |
| `mouth_round` | Round opening |
| `blink` | Fully closed eyes; may occur on multiple meshes |

Mouth keys are smoothly blended; blinking targets both eyes. Override target names using `morphs: { mouth: { large: 'jawOpen' }, blink: 'eyesClosed' }`. `avatar.capabilities` reports available expressions; the demo disables missing previews. A model without targets can still be inspected, but it cannot articulate those expressions.

This remains heuristic audio-reactive animation, not phoneme alignment, VRM support, a skeletal retargeter, or automatic rigging for arbitrary models. The unified demo shares microphone, file, local TTS and realtime voice controls across both renderers. Browser WebGL2, AudioWorklet and HTTPS/localhost microphone access are required.

## Validation

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run test:package
```

The morph tests load the actual Blender GLB, inspect its targets, exercise blending/reset, and check shared GPU disposal. Browser tests cover model loading, expression controls, file playback, microphone restart/cleanup, malformed imports/recovery, and mobile layout using synthetic audio.
