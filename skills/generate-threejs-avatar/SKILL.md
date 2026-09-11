---
name: generate-threejs-avatar
description: Create, adapt, validate, and integrate speaking 3D avatars for this repository's Three.js renderer using Blender sources and self-contained GLB models. Use for text or reference-based 3D character creation, mouth and blink shape keys, repairing imported GLB expressions, or adding a 3D avatar to the Studio. For layered 2D PNG characters, use generate-talking-sprite-character instead.
---

# Generate Three.js Avatar

Deliver an editable 3D character and a GLB that works with Hoho Avatar's existing PCM-driven mouth animation and blinking. Support text-only concepts, visual references, and existing Blender/GLB models; a reference image is optional.

## Locate the implementation

Find the repository containing `src/three/ThreeRenderer.ts`, `src/three/MorphRig.ts`, and `docs/THREE.md`. Read these files before authoring or adapting a model; the checked-out implementation is authoritative.

Relevant integration points:

- `scripts/blender/create_mochi.py`: working Blender 4.5 LTS example with editable meshes, materials, mouth keys, and blinking.
- `assets/blender/mochi.blend` and `public/models/mochi/mochi.glb`: original source and known-good runtime model.
- `src/core/MouthState.ts`: shared mouth vocabulary.
- `examples/basic/main.ts` and `examples/basic/index.html`: unified Studio selection and local GLB import.
- `tests/MorphRig.test.mjs` and `tests/ThreeRenderer.test.ts`: loader and motion behavior; their existing asset fixture is Mochi.

## Choose the deliverable

Infer the character's silhouette, palette, material treatment, and personality from the request. Ask only when an unresolved choice materially affects the result, such as which figure in a reference is the speaker. Preserve the requested style; the Three.js workflow has no pixel-art requirement.

Use a new lowercase hyphenated slug unless the user requests an existing character update.

| Delivery | Locations |
| --- | --- |
| Draft, private, or unspecified integration | `working/models/<slug>/` for `<slug>.blend`, `<slug>.glb`, generator script when used, and review images |
| Explicit public/demo integration | `assets/blender/<slug>.blend`, `public/models/<slug>/<slug>.glb`, and `scripts/blender/create_<slug_with_underscores>.py` when generated procedurally |

For working-only delivery, load the GLB through **Import avatar** without changing `public/`, the character picker, or `ASSETS.md`. Deliver the GLB directly; the Three.js loader does not use sprite PNG layers, a character ZIP, or `character.json`.

## Author or adapt the character

Read [references/blender-workflow.md](references/blender-workflow.md) when building geometry, editing a Blender/GLB source, adding shape keys, or exporting. Use Blender for mesh authoring; ImageGen is optional for concept art or textures and does not produce a rigged GLB.

Inspect an existing model before modifying it: identify the visible speaker, mesh and material organization, transforms, existing shape keys, and resource dependencies. Work from a copy unless replacement was requested. For a text-only concept, build a coherent new design rather than requiring a supplied model.

The exported model contract is:

- Binary glTF 2.0 (`.glb`), +Y up, front facing +Z. The renderer centers the model, grounds it, and scales its largest dimension to 3.5 stage units.
- Embedded geometry, buffers, and images. The current loader rejects any truthy `buffers[].uri` or `images[].uri`, including data URIs.
- Keep the file at or below `25 * 1024 * 1024` bytes for the Studio importer; this limit belongs to the demo, not the SDK loader.
- Use export-compatible materials and uncompressed assets. Draco/KTX2 decoders, VRM expression handling, skeletal retargeting, and automatic rigging are not configured.
- Export the character without the authoring floor, camera, or lights. These would affect bounds or duplicate the renderer's stage.

| Shape key | Meaning |
| --- | --- |
| Basis / zero morph weights | Rest and closed mouth; no `mouth_closed` target is required |
| `mouth_small` | Small opening |
| `mouth_large` | Large opening |
| `mouth_wide` | Wide opening |
| `mouth_round` | Round opening |
| `blink` | Closed eyes; may be present on multiple meshes |

For a fully expressive new avatar, create all four mouth targets and blinking unless the design intentionally omits a capability. Each target must deform geometry, not just have a matching name. Preserve topology across shape keys and export with all expression weights at zero.

Derive the expressions from the character. Keep lips, cavity, teeth, and eyelids consistent with the face and materials; simple geometric mouths suit mechanical designs but are not a universal human-mouth template. Check transitions for clipping and keep glasses, eyebrows, and other facial details intact during blinking.

`MorphRig` binds matching names across all meshes. A mouth spread over lip, cavity, and tooth meshes can use the same state name on each; both eyes can use `blink`. It smooths mouth influences and switches blink between zero and one. Make the combined deformations work together. Animation clips and bone-only expressions are not driven by this adapter.

For an existing model, preserve usable target names through `morphs` overrides when integrating via the SDK. Several mouth states can share one target, although this does not create distinct visual shapes. The Studio's current local importer supplies no custom morph mapping: rename/export targets to the defaults for a directly importable asset, or implement mapping support only if requested.

## Verify the exported result

Review the exported GLB, not only the Blender source. Reimport it into a clean review scene or load it with the repository's `GLTFLoader`. Inspect the actual morph names, deformations, materials, dimensions, and initial weights. Confirm each intended target has nonzero vertex deltas.

Render or capture the five mouth states with eyes open and closed: ten combinations for a blinking character, five without blinking. Inspect them at a useful face size for stable placement, distinct shapes, clipping, unexpected shadows, and complete eye closure. Also check a three-quarter view and intermediate mouth blends, since `MorphRig` crossfades targets. Fix failures and repeat only affected checks.

In the unified Studio, import the exact delivered GLB, exercise expression previews and sample playback, then verify orbit, zoom, reset, and the return to a closed mouth after stopping. Use the existing sample audio or synthetic test audio; external voice services are unnecessary for asset validation. Confirm reported `avatar.capabilities` match the intended expressions. A model loading successfully alone does not prove articulation.

For working-only model changes, these asset and import checks suffice. For code or public integration changes, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Use the relevant existing browser tests for changed Studio behavior, and `npm run test:package` if package exports or dependencies changed. Existing Mochi tests do not validate a newly generated model; inspect and load the new artifact itself. If Blender or browser validation is unavailable, report the specific unverified result and continue with checks that are available.

## Integrate when requested

Keep the shared `createAvatar()` API and lazy Three.js entry. Audio providers and `MotionController` already supply motion; model generation does not require another audio loop or mouth enum.

For a published character, add its asset path to `selectedAvatar()` in `examples/basic/main.ts`, using `import.meta.env.BASE_URL + 'models/<slug>/<slug>.glb'`. Update the matching hidden select option and visible `data-avatar` button in `examples/basic/index.html`; preserve existing entries. Record the model/source provenance and actual license in `ASSETS.md` and the model directory as appropriate. Do not assign the repository's MIT license to third-party input by default.

SDK usage with standard target names:

```typescript
import { createAvatar } from '@hh1st/hoho-avatar';
import { threeRenderer } from '@hh1st/hoho-avatar/three';

const avatar = await createAvatar(canvas, {
  renderer: threeRenderer({ model: '/models/<slug>/<slug>.glb' }),
  onError: error => console.error(error),
});
// Supply audio from a user gesture using avatar.playAudio(...) or startMicrophone().
// Release owned resources when unmounting:
// await avatar.destroy();
```

`model` also accepts an `ArrayBuffer` for local files. `signal` and `onError` belong to `createAvatar()` options. Example target override inside `threeRenderer()` options: `morphs: { mouth: { large: 'jawOpen' }, blink: 'eyesClosed' }`. Confirm the caller's URL base; the root-relative example above must be adapted for subpath deployments.

## Completion

Report the source and GLB paths, delivery stage, generation method, file size, supported mouth/blink targets or overrides, visual/import verification, and relevant test results. Include the exact load snippet for the delivered model. Distinguish authored assets, exported assets, and checks actually performed.
