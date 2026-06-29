import { describe, it, expect } from 'vitest';
import { trimFormStrings } from '../utils/trimFormStrings';

describe('trimFormStrings', () => {
  it('trims string fields in a flat object', () => {
    expect(trimFormStrings({
      title: '  Hello  ',
      body: '\nComment\n',
      reason: '  mod reason  ',
    })).toEqual({
      title: 'Hello',
      body: 'Comment',
      reason: 'mod reason',
    });
  });

  it('leaves password fields unchanged', () => {
    expect(trimFormStrings({
      username: '  alice  ',
      password: '  secret  ',
      confirmPassword: '  secret  ',
    })).toEqual({
      username: 'alice',
      password: '  secret  ',
      confirmPassword: '  secret  ',
    });
  });

  it('trims strings inside nested objects and arrays', () => {
    expect(trimFormStrings({
      links: [{ label: '  Home  ', url: '  /  ' }],
      meta: { note: '  hi  ' },
    })).toEqual({
      links: [{ label: 'Home', url: '/' }],
      meta: { note: 'hi' },
    });
  });

  it('returns non-string primitives unchanged', () => {
    expect(trimFormStrings(42)).toBe(42);
    expect(trimFormStrings(null)).toBe(null);
  });
});
