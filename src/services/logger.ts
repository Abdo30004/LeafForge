import type { LogEntry, LogLevel } from '../types/ipc';
import { formatErrorMessage, formatErrorDetails } from '../utils/formatError';
import { writeLogEntry } from './tauriClient';
import { useLogStore } from '../store/useLogStore';

let logCounter = 1;

class Logger {
  public log(level: LogLevel, target: string, messageOrError: unknown, details?: unknown): void {
    let message: string;
    let detailsStr: string | undefined;

    if (typeof messageOrError === 'string') {
      message = messageOrError;
      if (details !== undefined) {
        detailsStr = typeof details === 'string' ? details : formatErrorDetails(details);
      }
    } else {
      // An error object was passed as message
      message = formatErrorMessage(messageOrError);
      detailsStr = details !== undefined
        ? (typeof details === 'string' ? details : formatErrorDetails(details))
        : formatErrorDetails(messageOrError);
    }

    const entry: LogEntry = {
      id: `client-log-${Date.now()}-${logCounter++}`,
      timestamp: new Date().toISOString(),
      level,
      target,
      message,
      details: detailsStr && detailsStr !== message ? detailsStr : undefined,
    };

    // 1. Add to reactive state store for UI inspection
    useLogStore.getState().addLog(entry);

    // 2. Transmit to backend to append to leafforge.log on disk
    writeLogEntry(level, target, message, entry.details).catch(() => {
      // Silent fail if backend is shutting down
    });

    // 3. Format console message without [object Object]
    const consoleTag = `[${level}] [${target}]`;
    switch (level) {
      case 'CRASH':
      case 'ERROR':
        console.error(consoleTag, message, entry.details || '');
        break;
      case 'WARN':
        console.warn(consoleTag, message, entry.details || '');
        break;
      case 'INFO':
        console.info(consoleTag, message, entry.details || '');
        break;
      case 'DEBUG':
        console.debug(consoleTag, message, entry.details || '');
        break;
    }
  }

  public debug(target: string, message: unknown, details?: unknown): void {
    this.log('DEBUG', target, message, details);
  }

  public info(target: string, message: unknown, details?: unknown): void {
    this.log('INFO', target, message, details);
  }

  public warn(target: string, message: unknown, details?: unknown): void {
    this.log('WARN', target, message, details);
  }

  public error(target: string, message: unknown, details?: unknown): void {
    this.log('ERROR', target, message, details);
  }

  public crash(target: string, message: unknown, details?: unknown): void {
    this.log('CRASH', target, message, details);
  }
}

export const logger = new Logger();

/**
 * Initializes global browser crash and unhandled rejection listeners.
 */
export function initGlobalErrorLogging(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    logger.crash(
      'Window',
      event.message || 'Uncaught runtime error',
      event.error ? formatErrorDetails(event.error) : `At ${event.filename}:${event.lineno}:${event.colno}`
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    logger.crash(
      'Promise',
      'Unhandled Promise Rejection',
      formatErrorDetails(event.reason)
    );
  });
}
