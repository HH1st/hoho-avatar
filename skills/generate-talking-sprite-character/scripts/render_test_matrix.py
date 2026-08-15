import argparse
import json
from pathlib import Path
from PIL import Image, ImageDraw

from render_preview import EYES, MOUTHS, render_state


def main():
    parser = argparse.ArgumentParser(description="Render every mouth and eye state into one review sheet")
    parser.add_argument("character", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--cell-size", type=int, default=256)
    args = parser.parse_args()
    if args.cell_size < 128 or args.cell_size > 512:
        parser.error("cell size must be between 128 and 512")

    definition = json.loads(args.character.read_text(encoding="utf-8"))
    eye_states = EYES if "eyes" in definition else ("open",)
    label_width = 72
    header_height = 28
    gap = 4
    width = label_width + len(MOUTHS) * (args.cell_size + gap) - gap
    height = header_height + len(eye_states) * (args.cell_size + gap) - gap
    sheet = Image.new("RGB", (width, height), (18, 22, 30))
    draw = ImageDraw.Draw(sheet)

    for column, mouth in enumerate(MOUTHS):
        x = label_width + column * (args.cell_size + gap)
        draw.text((x + 6, 8), mouth.upper(), fill=(220, 226, 235))

    for row, eyes in enumerate(eye_states):
        y = header_height + row * (args.cell_size + gap)
        draw.text((8, y + 8), f"EYES\n{eyes.upper()}", fill=(220, 226, 235), spacing=4)
        for column, mouth in enumerate(MOUTHS):
            x = label_width + column * (args.cell_size + gap)
            frame = render_state(args.character, mouth, eyes).convert("RGB")
            frame = frame.resize((args.cell_size, args.cell_size), Image.Resampling.NEAREST)
            sheet.paste(frame, (x, y))

    args.out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.out, optimize=True)
    print(f"{args.out} states={len(MOUTHS) * len(eye_states)} cell={args.cell_size}")


if __name__ == "__main__":
    main()
