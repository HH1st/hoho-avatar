# Expression layer art direction

Use the generated layers as a starting point. Humanoid mouths usually need character-specific refinement before delivery.

## Palette

- Sample or harmonize an outline, lip, mouth-interior, tongue, and optional tooth color from the body.
- Avoid pure black cavities and pure white teeth unless the body already uses that contrast.
- Keep lip and blink colors related to nearby facial shadows or eye lines.

## State anatomy

- `closed`: preserve personality with a restrained curve, corner lift, asymmetry, or lip accent. Reject a ruler-straight bar unless the character is intentionally mechanical.
- `small`: show a compact cavity; use teeth or tongue only when they remain legible.
- `large`: increase vertical opening and expose different anatomy from `small`.
- `wide`: increase horizontal stretch and keep visible mouth corners. Reject a detached horizontal strip.
- `round`: use a stepped oval with an interior cavity. Reject a square outline or hollow rectangular frame.

Keep all states centered and related, but do not scale one universal shape into five sizes. Teeth are optional per state; `round` often reads better without them.

## Delivery gate

Reject a humanoid mouth set when any state:

- reads as a single-color sticker or generic symbol;
- has no visible relationship to the character's palette or expression;
- changes center, lip weight, or pixel density unexpectedly;
- becomes a square, bar, or detached object at the 256-pixel matrix preview size;
- looks acceptable alone but pasted on when composed with either eye state.

Render the complete state matrix after every meaningful mouth revision. Judge the composite, not the transparent layer in isolation.
