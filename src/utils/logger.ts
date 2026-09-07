/**
 * Production-safe logger utility
 * Only outputs logs and warnings in development mode (import.meta.env.DEV)
 */

const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

export const logger = {
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (isDev) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    if (isDev) {
      console.error(...args);
    }
  },
  info: (...args: any[]) => {
    if (isDev) {
      console.info(...args);
    }
  }
};
