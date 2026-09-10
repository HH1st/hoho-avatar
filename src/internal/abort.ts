/** Cancel the wait without leaving a late rejection unobserved. */
export function abortError(): DOMException {
  return new DOMException('Operation cancelled', 'AbortError');
}

export async function waitFor<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation;
  let cancel!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    cancel = () => reject(signal.reason ?? abortError());
    if (signal.aborted) cancel();
    else signal.addEventListener('abort', cancel, { once: true });
  });
  try {
    return await Promise.race([operation, cancelled]);
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
