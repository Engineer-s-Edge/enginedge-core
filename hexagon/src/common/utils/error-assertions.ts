/**
 * Error assertion utilities for type-safe error handling
 */

/**
 * Type guard that asserts the value is an Error instance
 * @param e - The value to check
 * @throws Error if the value is not an Error instance
 */
export function assertIsError(e: unknown): asserts e is Error {
  if (!(e instanceof Error)) {
    throw new Error(typeof e === 'string' ? e : 'Non-Error thrown');
  }
}

/**
 * Extracts error information from an unknown value
 * @param e - The error value (Error, string, or any)
 * @returns Object with message and optional stack trace
 */
export function getErrorInfo(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) {
    return { message: e.message, stack: e.stack };
  }
  try {
    return { message: JSON.stringify(e) };
  } catch {
    return { message: String(e) };
  }
}

