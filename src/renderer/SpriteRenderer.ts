import type { MotionFrame } from "../core/types";
import type { LoadedCharacter } from "./AssetLoader";

export class SpriteRenderer {
  private readonly context: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly character: LoadedCharacter) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is not available");
    this.context = context;
    canvas.width = character.definition.canvas.width;
    canvas.height = character.definition.canvas.height;
    context.imageSmoothingEnabled = false;
  }

  render(motion: MotionFrame, eyesClosed: boolean): void {
    const { context, canvas, character } = this;
    const { definition } = character;
    const maxBounce = definition.animation?.bodyBouncePx ?? 3;
    const bounce = motion.speaking ? -Math.round(motion.energy * maxBounce) : 0;
    context.clearRect(0, 0, canvas.width, canvas.height);

    const body = definition.body;
    context.drawImage(character.body, body.x ?? 0, (body.y ?? 0) + bounce, body.width ?? character.body.width, body.height ?? character.body.height);

    if (definition.eyes && character.eyes) {
      const image = character.eyes[eyesClosed ? "closed" : "open"];
      context.drawImage(image, Math.round(definition.eyes.anchor.x - image.width / 2), Math.round(definition.eyes.anchor.y - image.height / 2 + bounce));
    }

    const mouth = character.mouths[motion.mouth];
    if (mouth) context.drawImage(mouth, Math.round(definition.mouth.anchor.x - mouth.width / 2), Math.round(definition.mouth.anchor.y - mouth.height / 2 + bounce));
  }
}
