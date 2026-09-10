import { ThreeRenderer, type ThreeRendererOptions } from './ThreeRenderer';
import type { RendererFactory } from '../core/renderer';
export { ThreeRenderer } from './ThreeRenderer';
export type { ThreeRendererOptions } from './ThreeRenderer';
export { MorphRig } from './MorphRig';
export type { MorphRigOptions } from './MorphRig';
export function threeRenderer(options: ThreeRendererOptions): RendererFactory {
  return (canvas, context) => new ThreeRenderer(canvas, options, context);
}
