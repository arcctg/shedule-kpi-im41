/**
 * Escapes special HTML characters in a string so it is safe to embed inside
 * a Telegram parse_mode:"HTML" message.
 *
 * Replacements (per the Telegram Bot API spec):
 *   &  →  &amp;
 *   <  →  &lt;
 *   >  →  &gt;
 *   "  →  &quot;
 */
export function htmlEscape(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
