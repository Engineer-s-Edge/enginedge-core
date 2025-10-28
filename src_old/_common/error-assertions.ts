export function assertIsError(e: unknown): asserts e is Error {
  if (!(e instanceof Error)) {
    throw new Error(typeof e === 'string' ? e : 'Non-Error thrown');
  }
}

export function getErrorInfo(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) return { message: e.message, stack: e.stack };
  try {
    return { message: JSON.stringify(e) };
  } catch {
    return { message: String(e) };
  }
}
