/** Fail at the owning feature when its required markup is missing. */
export function element<T extends Element = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing Studio element: ${selector}`);
  return node;
}
