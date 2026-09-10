import { CanvasRenderer, type CanvasRendererOptions } from './CanvasRenderer';
import type { RendererFactory } from '../core/renderer';
export { CanvasRenderer } from './CanvasRenderer';
export type { CanvasRendererOptions } from './CanvasRenderer';
export function canvasRenderer(options: CanvasRendererOptions): RendererFactory {
  return (canvas) => new CanvasRenderer(canvas, options);
}
