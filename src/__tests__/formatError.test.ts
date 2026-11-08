import { describe, it, expect } from 'vitest';
import { parseAppError, formatErrorMessage, formatErrorDetails } from '../utils/formatError';

describe('formatError utility', () => {
  it('parses standard Error instances', () => {
    const err = new Error('Disk full exception');
    const parsed = parseAppError(err);
    expect(parsed.message).toBe('Disk full exception');
    expect(parsed.code).toBeUndefined();
    expect(formatErrorMessage(err)).toBe('Disk full exception');
    expect(formatErrorMessage(err)).not.toContain('[object Object]');
  });

  it('parses string errors', () => {
    const err = 'Failed to clone repository from GitHub';
    const parsed = parseAppError(err);
    expect(parsed.message).toBe('Failed to clone repository from GitHub');
    expect(formatErrorMessage(err)).toBe('Failed to clone repository from GitHub');
    expect(formatErrorMessage(err)).not.toContain('[object Object]');
  });

  it('parses Tauri AppErrorPayload objects correctly', () => {
    const tauriError = {
      code: 'AUTH_FAILED',
      message: 'GitHub Device Flow expired or access denied',
      details: 'Status 400 Bad Request: authorization_pending',
    };
    const parsed = parseAppError(tauriError);
    expect(parsed.code).toBe('AUTH_FAILED');
    expect(parsed.message).toBe('GitHub Device Flow expired or access denied');
    expect(parsed.details).toBe('Status 400 Bad Request: authorization_pending');

    const formatted = formatErrorMessage(tauriError);
    expect(formatted).toBe(
      'GitHub Device Flow expired or access denied (Status 400 Bad Request: authorization_pending)'
    );
    expect(formatted).not.toContain('[object Object]');

    const details = formatErrorDetails(tauriError);
    expect(details).toContain('AUTH_FAILED');
    expect(details).toContain('authorization_pending');
  });

  it('parses OAuth error response payloads', () => {
    const oauthError = {
      error: 'slow_down',
      error_description: 'You are polling too fast. Wait 5 seconds.',
    };
    const parsed = parseAppError(oauthError);
    expect(parsed.code).toBe('slow_down');
    expect(parsed.message).toBe('You are polling too fast. Wait 5 seconds.');

    const formatted = formatErrorMessage(oauthError);
    expect(formatted).toBe('You are polling too fast. Wait 5 seconds.');
    expect(formatted).not.toContain('[object Object]');
  });

  it('handles arbitrary plain objects without returning [object Object]', () => {
    const customObj = { status: 500, reason: 'Compiler process killed unexpectedly' };
    const formatted = formatErrorMessage(customObj);
    expect(formatted).not.toContain('[object Object]');
    expect(formatted).toBe('Compiler process killed unexpectedly');
  });

  it('handles empty, null, or undefined values gracefully', () => {
    expect(formatErrorMessage(null, 'Operation failed')).toBe('Operation failed');
    expect(formatErrorMessage(undefined, 'Fallback error')).toBe('Fallback error');
    expect(formatErrorMessage(null)).toBe('An unknown error occurred.');
    expect(formatErrorMessage(null)).not.toContain('[object Object]');
  });

  it('handles circular objects safely and never produces [object Object]', () => {
    const circularObj: Record<string, unknown> = { name: 'cyclic' };
    circularObj.self = circularObj;

    const formatted = formatErrorMessage(circularObj);
    expect(formatted).not.toContain('[object Object]');
    expect(formatted).toContain('Object with keys: [name, self]');
  });

  it('prefixes messages with fallback prefix when specified', () => {
    const tauriError = {
      code: 'GIT_ERROR',
      message: 'Authentication failed for repository',
    };
    const formatted = formatErrorMessage(tauriError, 'Failed to clone repository');
    expect(formatted).toBe('Failed to clone repository: Authentication failed for repository');
    expect(formatted).not.toContain('[object Object]');
  });
});
