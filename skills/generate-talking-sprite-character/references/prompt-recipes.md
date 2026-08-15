# Body generation prompt recipes

## Text-only front-facing character

Use this recipe when the user describes a character without providing an image. Replace bracketed text with the user's concept and make coherent choices for unspecified details.

```text
Use case: stylized-concept
Asset type: layered 2D talking-avatar base artwork
Primary request: design one original speaking character based on this description: [character description]
Character direction: translate the description into a distinctive silhouette, face, eyes, wardrobe or body treatment, palette, and personality; keep all choices internally consistent
Style/medium: authentic 16-bit game portrait designed on a coarse 64x64 grid; large square pixel clusters; stepped diagonals; flat shapes; no antialiasing
Composition/framing: square 1:1 canvas, centered front-facing character with a large head, compact shoulders or upper body, and generous padding
Constraints: exactly one character; two open eyes unless the concept requires another eye layout; leave the entire mouth area completely blank with no lip, line, shadow, or dark pixels; clear face-color or body-color area around the eyes; no text; no watermark
Avoid: extra characters, ambiguous face, smooth curves, gradients, soft texture, 3D, any mouth pixels
```

## Reference-guided front-facing character

```text
Use case: stylized-concept
Asset type: layered 2D talking-avatar base artwork
Input images: label each image as identity/style/composition reference
Primary request: create one centered front-facing character with a large head and compact shoulders
Style/medium: authentic 16-bit game portrait designed on a coarse 64x64 grid; large square pixel clusters; stepped diagonals; flat shapes; no antialiasing
Composition/framing: square 1:1 canvas, centered, symmetrical, generous padding
Constraints: preserve the reference eye shape, spacing, gaze, glasses interaction, and contrast in the chosen pixel-art language; leave the entire mouth area completely blank with no lip, line, shadow, or dark pixels; clear face-color area around both eyes; exactly one character; no text; no watermark
Avoid: side profile, smooth curves, gradients, soft texture, 3D, detailed nose, any mouth pixels
```

## Profile or multi-subject character

```text
Use case: stylized-concept
Asset type: layered 2D talking-avatar base artwork
Primary request: preserve the requested profile or multi-subject composition and make only the named subject the speaker
Style/medium: coarse-grid 16-bit pixel art; flat color regions without a fixed color-count limit; hard nearest-neighbor edges
Constraints: keep non-speaking subjects fully static; preserve the speaking subject's reference eye design in the chosen pixel-art language and leave its mouth area completely blank; leave clear face-color pixels around the eye; no text; no watermark
Avoid: ambiguous speaker, mouth pixels on the speaker, antialiasing, gradients, extra subjects
```

Always state invariants again when iterating: preserve identity, composition, colors, open eyes, and blank mouth region; change only the named defect.

Expression layers are judged against the source concept, any references, and the final body—not against a universal template. Match the artwork's eye geometry, eyelid weight, lip colors, tooth visibility, tooth tone, pixel density, and contrast. Teeth are optional per mouth state; include them only when they improve articulation without breaking the character's style.
