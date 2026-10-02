import { describe, expect, it } from 'vitest';
import {
  MAX_PRONUNCIATION,
  MAX_TEMPLATE,
  sanitizeSpoken,
  validatePronunciation,
  validateTemplate,
} from '../../src/commands/validation.js';

describe('sanitizeSpoken', () => {
  it('removes markup characters so text can never become SSML', () => {
    expect(sanitizeSpoken('<b>Tom</b> & Jerry')).toBe('bTom/b Jerry');
  });

  it('removes user, role and channel mentions', () => {
    expect(sanitizeSpoken('hi <@123> <@!456> <@&789> <#42> there')).toBe('hi there');
  });

  it('removes custom and animated emoji', () => {
    expect(sanitizeSpoken('yo <:pog:123> <a:dance:456>!')).toBe('yo !');
  });

  it('collapses whitespace and control characters', () => {
    expect(sanitizeSpoken('  a\n\tb\u0000  c ')).toBe('a b c');
  });
});

describe('validateTemplate', () => {
  it('accepts text and returns the sanitized value', () => {
    expect(validateTemplate('  %name   is here ')).toEqual({ ok: true, value: '%name is here' });
  });

  it('does not count %name toward the length limit', () => {
    const text = '%name' + 'x'.repeat(MAX_TEMPLATE);
    expect(validateTemplate(text).ok).toBe(true);
  });

  it('rejects text longer than the limit', () => {
    const result = validateTemplate('x'.repeat(MAX_TEMPLATE + 1));
    expect(result).toEqual({ ok: false, error: expect.stringContaining('150') });
  });

  it('rejects text that is empty after sanitizing', () => {
    expect(validateTemplate(' <@123> ').ok).toBe(false);
  });

  it('accepts a template without %name', () => {
    expect(validateTemplate('Somebody arrived')).toEqual({ ok: true, value: 'Somebody arrived' });
  });
});

describe('validatePronunciation', () => {
  it('accepts a short name', () => {
    expect(validatePronunciation('Ar-mahn-doe')).toEqual({ ok: true, value: 'Ar-mahn-doe' });
  });

  it('rejects text longer than the limit', () => {
    expect(validatePronunciation('x'.repeat(MAX_PRONUNCIATION + 1)).ok).toBe(false);
  });

  it('rejects text with nothing speakable in it', () => {
    expect(validatePronunciation('🔥🔥').ok).toBe(false);
  });
});
