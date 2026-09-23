import { describe, it, expect, vi } from 'vitest';
import { logger } from '../src/utils/logger';

describe('Logger Utility', () => {
  it('should have log, warn, error, and info methods defined', () => {
    expect(typeof logger.log).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.info).toBe('function');
  });

  it('should safely execute logging without throwing exceptions', () => {
    expect(() => {
      logger.log('Test message', { key: 'value' });
      logger.warn('Warning message');
      logger.error('Error message', new Error('Test'));
      logger.info('Info message');
    }).not.toThrow();
  });
});
