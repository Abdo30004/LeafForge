/**
 * Universal error parser and formatter.
 * Safely extracts human-readable messages, error codes, and technical details from
 * any error type (Tauri AppErrorPayload, standard Error, API response objects, or strings).
 * Guarantees that "[object Object]" is NEVER displayed to the user.
 */

export interface ParsedAppError {
  code?: string;
  message: string;
  details?: string;
  stack?: string;
  raw: unknown;
}

export function parseAppError(err: unknown): ParsedAppError {
  if (err === null || err === undefined) {
    return {
      message: 'An unknown error occurred.',
      raw: err,
    };
  }

  // 1. Primitive string
  if (typeof err === 'string') {
    const trimmed = err.trim();
    if (!trimmed) {
      return { message: 'An unknown empty error occurred.', raw: err };
    }
    // Attempt parsing if stringified JSON
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return parseAppError(parsed);
      } catch {
        // Fall through to plain string
      }
    }
    return { message: trimmed, raw: err };
  }

  // 2. Standard Error instance
  if (err instanceof Error) {
    const customCode = (err as unknown as Record<string, unknown>).code;
    const customDetails = (err as unknown as Record<string, unknown>).details;

    return {
      code: typeof customCode === 'string' ? customCode : undefined,
      message: err.message || 'An unexpected error occurred.',
      details: typeof customDetails === 'string' ? customDetails : undefined,
      stack: err.stack,
      raw: err,
    };
  }

  // 3. Object-based errors (such as Tauri AppErrorPayload: { code, message, details })
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;

    // Tauri AppErrorPayload or OAuth error code format
    const code =
      typeof obj.code === 'string'
        ? obj.code
        : typeof obj.error === 'string'
          ? obj.error
          : undefined;

    const details = typeof obj.details === 'string' ? obj.details : undefined;
    const stack = typeof obj.stack === 'string' ? obj.stack : undefined;

    let message: string | undefined;

    if (typeof obj.message === 'string' && obj.message.trim().length > 0) {
      message = obj.message.trim();
    } else if (
      typeof obj.error_description === 'string' &&
      obj.error_description.trim().length > 0
    ) {
      message = obj.error_description.trim();
    } else if (typeof obj.error === 'string' && obj.error.trim().length > 0) {
      message = obj.error.trim();
    } else if (typeof obj.reason === 'string' && obj.reason.trim().length > 0) {
      message = obj.reason.trim();
    }

    if (message) {
      return {
        code,
        message,
        details,
        stack,
        raw: err,
      };
    }

    // Fallback: serialize non-standard object to JSON instead of "[object Object]"
    try {
      const serialized = JSON.stringify(err, null, 2);
      if (serialized && serialized !== '{}') {
        return {
          code,
          message: serialized,
          details,
          stack,
          raw: err,
        };
      }
    } catch {
      // Circular structure or failed serialization
    }

    // Never return "[object Object]"
    const safeSummary = (() => {
      try {
        const keys = Object.keys(obj).slice(0, 8).join(', ');
        const ctor = (obj as { constructor?: { name?: string } }).constructor?.name || 'Object';
        return `${ctor} with keys: [${keys}]`;
      } catch {
        return 'Complex error object';
      }
    })();

    return {
      code,
      message: `An unrecognized error occurred (${safeSummary}).`,
      details: details,
      stack,
      raw: err,
    };
  }

  const rawStr = String(err);
  return {
    message: rawStr === '[object Object]' ? 'An unexpected error occurred.' : rawStr,
    raw: err,
  };
}

/**
 * Returns a concise, user-friendly single-string error summary.
 * If fallbackOrPrefix is provided, it will be used as a prefix or default message.
 */
export function formatErrorMessage(err: unknown, fallbackOrPrefix?: string): string {
  const parsed = parseAppError(err);
  let mainMsg = parsed.message;
  if (parsed.details && parsed.details !== parsed.message && !parsed.message.includes(parsed.details)) {
    mainMsg = `${parsed.message} (${parsed.details})`;
  }

  if (!fallbackOrPrefix) {
    return mainMsg;
  }

  // If the parsed error was empty/unknown or defaulted, use the fallback directly
  if (!parsed.message || parsed.message === 'An unknown error occurred.') {
    return fallbackOrPrefix;
  }

  // Otherwise, prefix the message if it does not already start with it
  if (!mainMsg.toLowerCase().startsWith(fallbackOrPrefix.toLowerCase())) {
    return `${fallbackOrPrefix}: ${mainMsg}`;
  }

  return mainMsg;
}

/**
 * Returns full technical details including error code, message, and diagnostic traces.
 */
export function formatErrorDetails(err: unknown): string {
  const parsed = parseAppError(err);
  const parts: string[] = [];

  if (parsed.code) {
    parts.push(`[Error Code: ${parsed.code}]`);
  }
  parts.push(parsed.message);

  if (parsed.details && parsed.details !== parsed.message) {
    parts.push(`Details: ${parsed.details}`);
  }
  if (parsed.stack) {
    parts.push(`\nStack Trace:\n${parsed.stack}`);
  }

  return parts.join('\n');
}
