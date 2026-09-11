# Blender authoring and export

Read `scripts/blender/create_mochi.py` for this repository's working Blender 4.5 LTS implementation. It generates Mochi, writes its public GLB and source `.blend`, and renders a preview. Its output paths are hardcoded and it clears the current scene. Do not run it unchanged to create a different character.

## Runtime and source handling

Locate Blender with `Get-Command blender` on PowerShell or `command -v blender` on POSIX. If absent from PATH, inspect known installation locations or the configured toolchain before treating it as unavailable. Record the Blender version used. Run scene-generating scripts in a separate background process so they do not clear an open editing session.

For a new procedural character, adapt the useful geometry/material helpers into a generator under the chosen working directory. Set all source, export, and preview paths for the new slug before execution. Keep the script reproducible and separate the character objects from the studio setup. For an existing model, open a copy of its `.blend` or import its `.glb`; inspect shape keys and materials before rebuilding anything.

Example command from the repository root, with the actual executable and slug substituted:

```powershell
& $blenderPath --background --python "working/models/<slug>/create_avatar.py"
```

Set `$blenderPath` to the discovered executable. This command runs in the terminal without starting an interactive Blender window. Do not add `--factory-startup` when the script intentionally depends on a supplied source scene.

## Geometry and expressions

Blender's example uses +Z up with the face toward -Y. The standard glTF export conversion (`export_yup=True`) produces +Y up and front +Z. Check imported models before changing transforms; they may already have the correct orientation.

Apply intended object scale and finalize topology-changing modeling operations before adding shape keys. Shape keys must share vertex count and ordering. Do not indiscriminately apply modifiers to a mesh with shape keys; preserve their evaluated deformation through export. The renderer frames all included geometry, so distant helpers or hidden prop meshes can make the actual face tiny.

For each expressive mesh:

1. Add or preserve `Basis` as the neutral geometry.
2. Add the relevant mouth or blink key as a deformation relative to Basis.
3. Keep the expressions centered on the same face; make large and round states work with the surrounding lips and cavity.
4. Test mouth pairs at intermediate weights and every mouth with blink enabled.
5. Return all expression weights to zero before saving and exporting.

The example's separate eyes each carry `blink`; the rig applies both together. For realistic eyelids, deform the surrounding geometry instead of merely flattening the eyeballs. For a mechanical or intentionally minimal character, simpler eye and mouth geometry can suit the design.

Materials should survive glTF's material model. Use supported Principled BSDF inputs and embedded image textures; bake Blender-only procedural shader effects when needed. The Three.js stage has its own lights and ACES tone mapping, so use a Studio preview to judge final color and contrast.

## Export only the character

Keep a list or collection containing the actual character meshes and required parents/armatures. Save the editable source with its useful camera and lights, then export only the character selection. The following is the exporter call used by this repository, with task-specific paths and selection:

```python
from pathlib import Path
import bpy

# out_dir, slug, and character_objects are supplied by the generator.
out_dir = Path(out_dir)
out_dir.mkdir(parents=True, exist_ok=True)
for obj in character_objects:
    keys = getattr(getattr(obj, 'data', None), 'shape_keys', None)
    if keys:
        for key in keys.key_blocks:
            key.value = 0.0

bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / f'{slug}.blend'))
bpy.ops.object.select_all(action='DESELECT')
for obj in character_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = character_objects[0]
bpy.ops.export_scene.gltf(
    filepath=str(out_dir / f'{slug}.glb'),
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_morph=True,
    export_animations=False,
)
```

For published delivery, change the source and runtime output paths to the locations in `SKILL.md`. Pack external source textures into the `.blend` or deliver their relative dependencies alongside it. Verify the GLB has embedded textures and no external resource URIs.

## Review the runtime export

Reimport the new GLB into a separate scene or process. Enumerate the meshes and their shape keys to verify export retained names and actual coordinate differences. Set the mouth weights to zero for closed, then to one for each individual non-closed state. Repeat with `blink` at zero and one. Use the character's front and three-quarter camera views; keep review lights and floor out of later exports.

Useful failures to investigate:

| Symptom | Check |
| --- | --- |
| Preview disabled | Exact case-sensitive morph names and `morphs` mapping; imported Studio GLBs use defaults |
| Target exists but does nothing | Exported vertex deltas, wrong mesh, modifier/export settings |
| Face starts deformed | Exported initial morph weights or an incorrect Basis |
| One eye stays open | `blink` missing from an eye/lid mesh or nonmatching target name |
| Mouth floats or intersects | Lip/cavity depth, surrounding topology, intermediate blended states |
| Avatar faces away or looks tiny | Axis conversion, unapplied transforms, exported non-character geometry |
| Textures disappear or load fails | Embedded images, compatible materials, resource URIs or unsupported compression |

Finish with the delivered file in the actual Studio. A Blender render verifies geometry but cannot verify the renderer's loading, lighting, capabilities, and PCM-driven behavior.
