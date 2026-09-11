# Hoho Avatar Studio

One page for Canvas, Three.js and Live2D characters. Run `npm ci`, `npm run setup:demo`, and `npm run dev` at the repository root, then open `http://127.0.0.1:5173/hoho-avatar/`.

The Studio imports SDK source. Select Niu Lai, Pixel Bot, Portrait, Blender-built Mochi (3D), or Wankoromochi (Live2D); microphone, audio files, local TTS and voice-agent controls share the same audio path. Import a character ZIP or a self-contained GLB through the same picker. Three.js and Live2D are dynamically imported only when selecting their characters.

To enable Wankoromochi locally, run `npm run setup:live2d-sample` and restart the dev server. Open `?character=live2d` or select Wankoromochi in the picker. See the [Live2D guide](../../docs/LIVE2D.md) for custom model URLs and sample terms.

`npm run build` creates this site in `examples/basic/dist/` using any configured Live2D URLs. GitHub Pages runs `npm run setup:live2d-sample`, `npm run build:pages` and `npm run test:pages` to include and verify the official sample, Core and notices. Preview that production build with `npm --prefix examples/basic run preview`. SDK package consumers can continue using the core and Canvas entries without installing optional renderer dependencies.
