---
name: generate-talking-sprite-character
description: Generate, configure, validate, and integrate layered 2D character assets for this repository's TalkingSprite PCM-driven Canvas engine, either from a text-only character description or from reference images. Use when a user asks to invent a speaking character, turn an idea or image into an avatar, produce pixel-art body/eye/mouth PNG layers, write character.json, preview mouth and blink states, add a character to public/characters, or make the demo load a new TalkingSprite character.
---

# Generate Talking Sprite Character

Create an engine-ready character set from a description or reference image. Default to coarse pixel art because discrete mouth switching is part of the engine's visual language.

## Locate the project

Find the repository root containing `src/core/TalkingSprite.ts` and `public/characters/`. Set:

- `<repo>`: repository root
- `<skill>`: this skill directory
- `<slug>`: lowercase hyphenated character name
- `<out>`: `<repo>/working/characters/<slug>` for drafts, private work, or unspecified publication intent; `<repo>/public/characters/<slug>` only when the user explicitly asks to publish or integrate the character into the demo

Do not overwrite an existing character unless the user explicitly requests replacement. Otherwise choose a new slug.

The bundled scripts require Python 3 and Pillow. Prefer the repository's configured Python runtime. If Pillow is unavailable, install the declared dependency into the project environment only after obtaining any required approval:

```bash
python -m pip install -r "<skill>/requirements.txt"
```

## Workflow

### 1. Define the character

Establish:

- source mode: text-only concept, reference-guided generation, or exact-image edit;
- delivery stage: working-only or explicitly published/demo-integrated;
- view: front-facing by default, or profile when explicitly requested;
- speaking subject when an image contains multiple figures;
- color treatment and distinguishing features;
- body bounce: `2` for mechanical front-facing sprites, `0` for static compositions.

For a text-only request, derive a coherent silhouette, face, wardrobe or body treatment, palette, and personality from the user's description. Make tasteful decisions for unspecified details and ask only when a missing choice would materially change the requested character. Do not require the user to supply a reference image.

Ask only when the speaking subject or intended view is genuinely ambiguous.

Default to working-only delivery when publication intent is absent. For working-only assets, do not modify `public/`, the demo selector, `ASSETS.md`, or production output.

### 2. Generate the body

Load and follow the `imagegen` skill when it is available. Read [references/prompt-recipes.md](references/prompt-recipes.md) before prompting.

Choose the matching recipe in [references/prompt-recipes.md](references/prompt-recipes.md). For text-only generation, describe the new character directly and omit `Input images`. For reference-guided work, label each image's role.

Generate one square base image with:

- open eyes already present and consistent with the source description or reference image's visual language;
- a completely blank mouth region;
- clear empty face color around eyes for blink overlays;
- no text, watermark, or unrelated props;
- a stable centered composition.

Treat user images as references unless the user asks to modify the exact image. Inspect every local edit target before editing it. When no image is provided, generate a new design rather than requesting a reference.

Copy the selected generated result into the project workflow. Never leave a project-referenced asset only in a generated-images directory.

### 3. Normalize to true pixel art

For the default pixel style, quantize deterministically:

```bash
python "<skill>/scripts/pixelize_image.py" <generated-image> "<out>/body.png" --grid 64 --size 512
```

Use a 64-pixel grid and nearest-neighbor enlargement while preserving the source colors by default. PNG does not require a limited palette. Use `--colors <count>` only when the user explicitly requests a limited-palette style. Inspect `body.png` at original detail after conversion and confirm that the requested concept, distinguishing features, and wardrobe or body treatment survived downsampling.

### 4. Choose anchors and colors

Use the 512x512 final body, not the pre-pixelized source.

- Front view defaults: mouth around `(256, 338)`, eye group around `(256, 256)`.
- Profile defaults: mouth around the visible face edge, single eye around the eye center.
- Sample `face-sample` from clean skin/face pixels, away from an eye or hair.
- Inspect the source brief, any references, and the final body before choosing eye, lip, mouth-interior, and tooth colors. Reuse nearby colors and contrast levels rather than imposing pure black or pure white.
- Treat inferred colors and default anchors as starting estimates, not style decisions.

Record anchor decisions explicitly before generating layers.

### 5. Generate expression layers

Read [references/expression-art-direction.md](references/expression-art-direction.md) before generating or revising humanoid mouths.

Front-facing pair of eyes:

```bash
python "<skill>/scripts/create_pixel_layers.py" \
  --body "<out>/body.png" --out-dir "<out>" \
  --eyes pair --face-sample 256,320 \
  --color 5A3328 --lip-color 8F483F --mouth-color 371F20 \
  --tooth-color EED8B2 --tongue-color B1584E
```

One eye for a profile composition:

```bash
python "<skill>/scripts/create_pixel_layers.py" \
  --body "<out>/body.png" --out-dir "<out>" \
  --eyes single --face-sample <x>,<y>
```

This must produce exactly:

```text
eyes-open.png
eyes-closed.png
mouth-closed.png
mouth-small.png
mouth-large.png
mouth-wide.png
mouth-round.png
```

Use `--eyes none` only when the character intentionally has no blinking.

Treat `create_pixel_layers.py` as a deterministic scaffold, not the final art direction. Its default humanoid mouths include multiple color regions, but still require composite review and character-specific refinement. Never deliver single-color geometric scaffold mouths for a humanoid unless the visual language is intentionally minimal or mechanical. In particular:

- preserve reference eye details when references exist; for text-only characters, derive eye shape, scale, spacing, eyelid weight, pupil treatment, and symmetry or asymmetry from the generated body;
- make closed eyes read as the same eyes blinking, including behind glasses; do not cover frames, eyebrows, highlights, or facial contours with obvious rectangular patches;
- derive mouth outlines and fills from the character's skin, lip, shadow, and line colors instead of defaulting to pure black;
- decide whether teeth are visible separately for `small`, `large`, `wide`, and `round`. Follow the reference expression and the chosen visual style: teeth may be absent, partially visible, or stylized, and need not use identical geometry across states;
- use an off-white sampled or harmonized with the artwork when teeth are shown. Avoid a bright white strip when the rest of the image has muted contrast;
- keep the five mouth states related as one mouth while allowing state-specific anatomy. Do not force every character into the same lip, tooth, or cavity template.
- make `closed` carry the reference personality, keep visible corners on `wide`, and make `round` a stepped oval rather than a square frame.

### 6. Write `character.json`

```bash
python "<skill>/scripts/write_character.py" \
  --out-dir "<out>" \
  --mouth-anchor <x>,<y> \
  --eyes pair --eyes-anchor <x>,<y> \
  --body-bounce 2
```

For a profile use `--eyes single`. For no eyes use `--eyes none` and omit `--eyes-anchor`.

Read [references/character-format.md](references/character-format.md) when changing the schema or renderer assumptions.

### 7. Render and inspect the complete state matrix

Render every mouth state with both eye states into one review image:

```bash
python "<skill>/scripts/render_test_matrix.py" "<out>/character.json" --out <test-matrix.png>
```

This produces ten cells for a blinking character and five for a character without eyes. Inspect the matrix once and confirm:

- all mouth states sit naturally on the intended speaker and share a stable center;
- `large`, `wide`, and `round` remain legible without reading as detached objects;
- no humanoid state reads as a single-color sticker, ruler-straight bar, square frame, or generic symbol;
- eye shape and blink treatment match the source concept or reference rather than looking like generic overlay symbols;
- closed eyes do not damage glasses, facial features, or the silhouette;
- teeth appear only where natural for that state and share the artwork's palette, pixel density, and contrast;
- eyes and mouths feel painted in the same hand as the body at both original size and matrix-preview size;
- requested concept or identity, clothing or body treatment, and composition details remain visible in the final composites.

If any cell fails, adjust the body, anchors, face sample, or layer geometry and regenerate the complete matrix. Use `render_preview.py` only for targeted debugging. Do not add browser automation or extra visual test passes unless the matrix exposes a problem that cannot be judged at 256-pixel cell size. Delete temporary review images after validation unless the user wants one retained.

### 8. Validate and integrate

Run:

```bash
python "<skill>/scripts/validate_character.py" "<out>/character.json"
```

For working-only delivery, package the required files into `<out>/character.zip` with `character.json` and all referenced PNGs at the ZIP root. Verify the archive and load it through the demo's Custom Avatar uploader. Keep the directory and ZIP under `working/`; do not copy them into `public/`.

For explicitly published delivery, verify the engine load path:

```ts
const sprite = new TalkingSprite(canvas, {
  character: "/characters/<slug>/character.json",
  sampleRate: 48000,
});
```

Only for explicitly published/demo-integrated delivery: if `examples/basic/main.ts` contains an avatar selector, add the new character unless the user asks for assets only. Preserve all existing characters.

Run the repository tests and production build after code or public integration changes. Working-only asset revisions require asset validation and ZIP verification, not a production build.

## Completion report

Report:

- saved character directory and configuration path;
- delivery stage and ZIP path for working-only assets;
- final generation prompt and whether ImageGen or a fallback was used;
- view, anchors, color/grid choices, and bounce setting;
- state-matrix review, validator, test, and build results;
- exact import/load snippet.
