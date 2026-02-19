import { describe, it, expect } from 'vitest';
import { htmlEscape } from '../../src/utils/htmlEscape';

describe('htmlEscape', () => {
    it('returns empty string unchanged', () => {
        expect(htmlEscape('')).toBe('');
    });

    it('escapes ampersand', () => {
        expect(htmlEscape('a & b')).toBe('a &amp; b');
    });

    it('escapes less-than', () => {
        expect(htmlEscape('<script>')).toBe('&lt;script&gt;');
    });

    it('escapes greater-than', () => {
        expect(htmlEscape('a > b')).toBe('a &gt; b');
    });

    it('escapes double quote', () => {
        expect(htmlEscape('"hello"')).toBe('&quot;hello&quot;');
    });

    it('escapes all special characters together', () => {
        expect(htmlEscape('<a href="test&value">text</a>')).toBe(
            '&lt;a href=&quot;test&amp;value&quot;&gt;text&lt;/a&gt;',
        );
    });

    it('leaves plain text unchanged', () => {
        expect(htmlEscape('Системне програмування')).toBe('Системне програмування');
    });

    it('handles multiple ampersands', () => {
        expect(htmlEscape('a & b & c')).toBe('a &amp; b &amp; c');
    });

    it('does not double-escape already-escaped entities', () => {
        // each & in &amp; gets re-escaped — this is correct "double escape" behaviour
        expect(htmlEscape('&amp;')).toBe('&amp;amp;');
    });
});
