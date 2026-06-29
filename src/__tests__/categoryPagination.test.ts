import { describe, it, expect } from 'vitest';
import {
  categoryListPath,
  categoryPageHref,
  parsePageQuery,
} from '../utils/categoryPagination';

describe('categoryPagination', () => {
  describe('parsePageQuery', () => {
    it('defaults to page 1', () => {
      expect(parsePageQuery({})).toBe(1);
    });

    it('reads the page query param', () => {
      expect(parsePageQuery({ page: '3' })).toBe(3);
    });

    it('rejects invalid values', () => {
      expect(parsePageQuery({ page: '0' })).toBe(1);
      expect(parsePageQuery({ page: 'abc' })).toBe(1);
    });
  });

  describe('categoryListPath', () => {
    it('builds the category list URL', () => {
      expect(categoryListPath('general')).toBe('/categories/general');
    });
  });

  describe('categoryPageHref', () => {
    it('returns the category path for page 1', () => {
      expect(categoryPageHref('general', 1, false)).toBe('/categories/general');
    });

    it('includes the page param', () => {
      expect(categoryPageHref('general', 2, false)).toBe('/categories/general?page=2');
    });

    it('preserves showDeleted', () => {
      expect(categoryPageHref('general', 2, true)).toBe('/categories/general?page=2&showDeleted=1');
    });
  });
});
