import { Live2DRenderer, type Live2DRendererOptions } from './Live2DRenderer';
import type { RendererFactory } from '../core/renderer';
export { Live2DRenderer } from './Live2DRenderer';
export type { Live2DRendererOptions } from './Live2DRenderer';
export { Live2DParameters } from './parameters';
export type { Live2DParameterOptions, Live2DMouthPose, Live2DParameterModel } from './parameters';
export function live2dRenderer(options: Live2DRendererOptions): RendererFactory {
  return (canvas, context) => new Live2DRenderer(canvas, options, context);
}
