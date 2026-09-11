# Live2D renderer

Live2D is a peer implementation of AvatarRenderer, using the same createAvatar, CharacterState, MouthState and audio APIs as Canvas and Three.js. The supported runtime combination is Cubism 3/4 model3.json + Cubism Core + pixi-live2d-display 0.4 + PixiJS 6. Cubism 2 and Cubism 5-specific features are not supported by this adapter.

## Use the SDK

Install @hh1st/hoho-avatar@next (0.1.0-beta.3), pixi.js@6.5.10, pixi-live2d-display@0.4.0 and @pixi/unsafe-eval@6.5.10. A local SDK tarball also works. These are optional peers: core/Canvas/Three.js consumers do not install or load them. Despite its name, @pixi/unsafe-eval is Pixi's official fallback for environments that forbid new Function. The Live2D entry can be imported on the server; browser dependencies load only when creating its renderer.

~~~ts
import { createAvatar } from '@hh1st/hoho-avatar';
import { live2dRenderer } from '@hh1st/hoho-avatar/live2d';

const avatar = await createAvatar(canvas, {
  renderer: live2dRenderer({
    model: '/models/character/character.model3.json',
    coreUrl: '/vendor/live2dcubismcore.min.js',
  }),
  signal: abortController.signal,
  onError: console.error,
});
await avatar.startMicrophone(); // user gesture
avatar.stopAudio();
// await avatar.playAudio(file);
// avatar.pushPCM(playedPCM, 24_000);
// avatar.previewMouth(MouthState.Round);
// await avatar.destroy();
~~~

Supply your licensed, self-hosted official Cubism Core script. It is not included in the SDK and no CDN is used implicitly. coreUrl may be omitted if window.Live2DCubismCore is already initialized. Do not switch Core versions in the same page. Model resources must be HTTP(S) URLs supporting same-origin access or CORS. CSP must permit your Core script, model fetches, and blob image/connect resources used by the loader and wasm-unsafe-eval for Cubism WebAssembly. JavaScript unsafe-eval is not required.

## One animation clock

The private Cubism adapter creates a Pixi Renderer/Container, not an Application or Ticker. Live2D autoUpdate and autoInteract are disabled. Each shared RenderFrame advances Cubism once. Physics, pose and breathing run first; the adapter applies the parameter callback immediately before the model update so those values are not overwritten. Animation stops when Avatar.stop() stops the shared controller.

## Internal boundary

Live2DRenderer only adapts RenderFrame, parameter mapping and viewport controls to the private Live2DRuntime port. It has no Pixi/Cubism imports or access to their model objects. The SDK core and Demo have not changed for this separation.

- internal/Runtime.ts: small engine-neutral port (parameters, size, draw, fit, destroy).
- internal/CubismRuntime.ts: version-specific Pixi/Cubism imports, CSP compatibility, model setup, beforeModelUpdate ordering, URL workaround and resource ownership.
- internal/CubismCore.ts: shared global Core loading.
- internal/CubismAssets.ts: model3 parsing, cancellable resource fetches and owned blob URLs.
- parameters.ts: shared mouth/state to numeric model parameter mapping; it receives a parameter facade rather than the Cubism core object.

Only the adapter understands virtual parameter indices, library destruction events and partial model assignment. It normalizes missing IDs and disposes late assets after cancellation. None of these private types are exported from the package entry. Upgrading Cubism/display versions should be confined to this adapter and its integration tests; a new renderer still implements the existing AvatarRenderer interface.

The first implementation loads moc3, textures and optional physics/pose. Motion files, expression files, hit-area actions and model sound playback are intentionally not started. Audio belongs to Avatar and the Studio voice room. This avoids a second audio or lip-sync lifecycle.

## Parameter mapping

Standard ParamMouthOpenY/ParamMouthForm, ParamEyeLOpen/ParamEyeROpen and ParamAngleZ are detected, with PARAM_* legacy names as fallback. Override names and poses using parameters. Missing parameters are not manufactured: Cubism virtual IDs are excluded from capability detection. If mouth opening exists, all shared states map to opening/form values; without a form parameter, their opening still varies but visual shapes may be less distinct. Missing eyes disable blink previews.

~~~ts
live2dRenderer({ model, coreUrl, parameters: {
  mouthOpen: 'MyJaw', eyeLeft: 'MyLeftEye', eyeRight: 'MyRightEye',
  mouth: { round: { open: 0.65, form: -0.8 } },
} });
~~~

Values use model units and are clamped to parameter limits. Shared Thinking adds a head tilt when available. View controls fit the full model canvas, provide wheel zoom, reset and disable through the same Avatar methods. Models with empty margins may need zooming.

## Unified Studio

For your model set VITE_LIVE2D_MODEL_URL, VITE_LIVE2D_CORE_URL and optionally VITE_LIVE2D_NAME in .env.local; restart npm run dev. The Live2D card appears in the existing character picker and shares microphone/file/TTS/voice-agent controls. There is no separate page.

For local development, `npm run setup:live2d-sample` downloads the official Wankoromochi sample and Core into ignored `tmp/live2d-sample`, together with their license references. Runtime and model files are checked against pinned SHA-256 hashes. Restart the dev server and select **Wankoromochi**. Only an explicit allowlist is served by the dev middleware.

The GitHub Pages demo includes this sample through a dedicated build:

```bash
npm run setup:live2d-sample
npm run build:pages
npm run test:pages
npm --prefix examples/basic run preview
```

Open `/hoho-avatar/?character=live2d` on the preview server to select Wankoromochi directly. The build verifies the cached resources before copying them, unchanged, into `examples/basic/dist/live2d/`, alongside their license documents and source checksums. Core and model requests stay on the site's own origin and respect the `/hoho-avatar/` base path. Pixi/Cubism load only when Live2D is selected. The Pages workflow runs the production browser checks before deploying.

The ordinary `npm run build` uses your configured model/Core URLs and does not include the sample. Neither build adds sample assets to `public/` or the SDK tarball. The official sample retains Live2D's Free Material and individual sample terms, with the required credit shown in the Studio. The setup command does not grant additional rights or a commercial release license.

## Licensing and verification

PixiJS and pixi-live2d-display have MIT licenses. Cubism Core, the embedded Cubism framework components and sample models have their own Live2D terms. Production hosts must supply appropriately licensed runtime/model assets and satisfy applicable Cubism release requirements. This SDK does not grant rights to those assets.

- https://www.live2d.com/eula/live2d-proprietary-software-license-agreement_en.html
- https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html
- https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html
- https://www.live2d.com/eula/live2d-sample-model-terms_en.html

Run `npm run typecheck`, `npm run lint` and `npm test`. Actual Cubism browser tests in `e2e/live2d.spec.mjs` require the local sample and run with `npm run test:e2e -- e2e/live2d.spec.mjs`. After `npm run build:pages`, `npm run test:pages` verifies the production resources, attribution, lazy loading and shared audio controls. Install Chromium with `npx playwright install chromium` before running browser tests. Physical device/browser GPU behavior remains a separate integration check.
