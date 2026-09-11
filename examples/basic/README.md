# Hoho Avatar Studio

One page for Canvas, Three.js and Live2D characters. Run `npm ci`, `npm run setup:demo`, and `npm run dev` at the repository root, then open `http://127.0.0.1:5173/hoho-avatar/`.

The Studio imports SDK source. Select Niu Lai, Pixel Bot, Portrait, Blender-built Mochi (3D), or Wankoromochi (Live2D); microphone, audio files, local TTS and voice-agent controls share the same audio path. Import a character ZIP or a self-contained GLB through the same picker. Three.js and Live2D are dynamically imported only when selecting their characters.

To enable Wankoromochi locally, run `npm run setup:live2d-sample` and restart the dev server. Open `?character=live2d` or select Wankoromochi in the picker. See the [Live2D guide](../../docs/LIVE2D.md) for custom model URLs and sample terms.

`npm run build` creates this site in `examples/basic/dist/` using any configured Live2D URLs. GitHub Pages runs `npm run setup:live2d-sample`, `npm run build:pages` and `npm run test:pages` to include and verify the official sample, Core and notices. Preview that production build with `npm --prefix examples/basic run preview`. SDK package consumers can continue using the core and Canvas entries without installing optional renderer dependencies.

## Code structure

`index.html` loads the styles before the first paint, and `main.ts` starts `Studio`. `Studio.ts` wires the features and owns audio-provider transitions and teardown.

- `CharacterLibrary.ts` owns character selection, ZIP/GLB imports and rollback. `characterCatalog.ts` defines typed character sources and lazy renderer factories; `CharacterStage.ts` owns the renderer lifetime.
- `StageView.ts` owns expressions, audio telemetry and viewport sizing. `ProviderTabs.ts` owns tab presentation and keyboard navigation. `StudioStatus.ts` writes shared stage readouts.
- `StudioAudio.ts` coordinates `MicrophoneControls.ts`, `ClipControls.ts` and `TTSControls.ts`. Each source owns its panel and playback resources. `VoiceAgentControls.ts` connects the existing `VoiceSession.ts` to the same stage.
- `studioConfig.ts` resolves environment configuration. `studioTypes.ts` contains the feature contracts, and `studioDom.ts` checks required DOM elements.

Selection and playback state live in TypeScript; DOM attributes and text reflect that state. Keep layout, selectors and palette changes in `index.html`, `style.css` and `morning.css`. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e` from the repository root when changing orchestration.
