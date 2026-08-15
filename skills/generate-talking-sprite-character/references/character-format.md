# TalkingSprite character format

The renderer resolves every image path relative to `character.json` and draws in this order:

```text
body -> eyes -> mouth
```

Required V1 mouth states are `closed`, `small`, `large`, `wide`, and `round`.

```json
{
  "version": 1,
  "canvas": { "width": 512, "height": 512 },
  "body": {
    "src": "body.png",
    "x": 0,
    "y": 0,
    "width": 512,
    "height": 512
  },
  "mouth": {
    "anchor": { "x": 256, "y": 338 },
    "sprites": {
      "closed": "mouth-closed.png",
      "small": "mouth-small.png",
      "large": "mouth-large.png",
      "wide": "mouth-wide.png",
      "round": "mouth-round.png"
    }
  },
  "eyes": {
    "anchor": { "x": 256, "y": 256 },
    "sprites": {
      "open": "eyes-open.png",
      "closed": "eyes-closed.png"
    }
  },
  "animation": { "bodyBouncePx": 2 }
}
```

The anchor is the center of the corresponding PNG layer. PNG layers must use RGBA transparency.

Use `bodyBouncePx: 0` for poster-like or multi-subject compositions. Use `1` or `2` for restrained pixel sprites. Avoid values above `3` in a 512x512 canvas.

The core library accepts either a URL or an in-memory definition:

```ts
new TalkingSprite(canvas, {
  character: "/characters/my-character/character.json",
  sampleRate: audioContext.sampleRate,
});
```
