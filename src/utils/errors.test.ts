import { describe, it, expect, vi, afterEach } from 'vitest';
import { debugError, errorCode, formatError, isDebugEnabled, isExpectedFsError } from './errors.js';

describe('error utilities', () => {
  afterEach(() => {
    delete process.env.MAC_CLEANER_DEBUG;
    vi.restoreAllMocks();
  });

  describe('formatError', () => {
    it('should prefix the errno code when it is not part of the message', () => {
      const error = Object.assign(new Error('permission denied'), { code: 'EACCES' });

      expect(formatError(error)).toBe('EACCES: permission denied');
    });

    it('should not duplicate the code when already present', () => {
      const error = Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });

      expect(formatError(error)).toBe('EACCES: permission denied');
    });

    it('should handle non-error values', () => {
      expect(formatError('boom')).toBe('boom');
      expect(formatError(undefined)).toBe('Unknown error');
      expect(formatError({})).toBe('Unknown error');
    });
  });

  describe('errorCode', () => {
    it('should return the errno code or UNKNOWN', () => {
      expect(errorCode(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe('ENOENT');
      expect(errorCode(new Error('x'))).toBe('UNKNOWN');
      expect(errorCode(null)).toBe('UNKNOWN');
    });
  });

  describe('isExpectedFsError', () => {
    it('should recognise routine filesystem failures', () => {
      expect(isExpectedFsError(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe(true);
      expect(isExpectedFsError(Object.assign(new Error('x'), { code: 'EPERM' }))).toBe(true);
      expect(isExpectedFsError(Object.assign(new Error('x'), { code: 'EBUSY' }))).toBe(false);
      expect(isExpectedFsError(new Error('x'))).toBe(false);
    });
  });

  describe('isDebugEnabled', () => {
    it('should be disabled by default and for falsy values', () => {
      expect(isDebugEnabled()).toBe(false);

      for (const value of ['', '0', 'false']) {
        process.env.MAC_CLEANER_DEBUG = value;
        expect(isDebugEnabled()).toBe(false);
      }
    });

    it('should be enabled for any other value', () => {
      process.env.MAC_CLEANER_DEBUG = '1';
      expect(isDebugEnabled()).toBe(true);
    });
  });

  describe('debugError', () => {
    it('should stay silent when debug is disabled', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      debugError('getSize(/tmp)', new Error('boom'));

      expect(spy).not.toHaveBeenCalled();
    });

    it('should log context and message when debug is enabled', () => {
      process.env.MAC_CLEANER_DEBUG = '1';
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      debugError('getSize(/tmp)', Object.assign(new Error('nope'), { code: 'EACCES' }));

      expect(spy.mock.calls.flat().join('\n')).toContain('getSize(/tmp): EACCES: nope');
    });
  });
});
