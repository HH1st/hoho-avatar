# Hoho Avatar Studio

One page for 2D and 3D characters. Run `npm ci`, `npm run setup:demo`, and `npm run dev` at the repository root, then open `http://127.0.0.1:5173/hoho-avatar/`.

The Studio imports SDK source. Select Niu Lai, Pixel Bot, Portrait, or Blender-built Mochi (3D); microphone, audio files, local TTS and voice-agent controls work with either renderer. Import a character ZIP or a self-contained GLB through the same picker. Three.js is dynamically imported only when selecting a 3D model.

`npm run build` creates this same site in `examples/basic/dist/`. GitHub Pages uses that build. SDK package consumers can continue using the core and Canvas entries without installing Three.js.
