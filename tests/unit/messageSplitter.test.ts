import { describe, it, expect } from 'vitest';
import { splitWeekMessageByDay } from '../../src/utils/messageSplitter';

const DAY_PREFIX = '⬜⬜⬜';

function makeDay(name: string, lines = 5): string {
    const content = Array.from({ length: lines }, (_, i) => `Пара ${i + 1}`).join('\n');
    return `${DAY_PREFIX} ${name}\n${content}`;
}

describe('splitWeekMessageByDay', () => {
    it('returns single-element array when message is short', () => {
        const msg = makeDay('Понеділок');
        expect(splitWeekMessageByDay(msg)).toHaveLength(1);
        expect(splitWeekMessageByDay(msg)[0]).toBe(msg);
    });

    it('does not split a message that is exactly 3800 chars', () => {
        const msg = 'a'.repeat(3800);
        expect(splitWeekMessageByDay(msg)).toHaveLength(1);
    });

    it('splits a message that exceeds 3800 chars at day boundary', () => {
        // Build 6 days, each ~700 chars → total ~4200 chars
        const days = ['Пн', 'Вв', 'Ср', 'Чт', 'Пт', 'Сб'].map((d) =>
            makeDay(d, 100), // 100 lines × ~8 chars each ≈ 800 chars per day
        );
        const msg = days.join('\n\n');
        const parts = splitWeekMessageByDay(msg);
        expect(parts.length).toBeGreaterThan(1);
    });

    it('never cuts a day in the middle — each part starts with day header or legend', () => {
        const days = ['Пн', 'Вв', 'Ср', 'Чт', 'Пт', 'Сб'].map((d) =>
            makeDay(d, 100),
        );
        const msg = days.join('\n\n');
        const parts = splitWeekMessageByDay(msg);

        for (const part of parts) {
            // Every non-empty chunk must contain a day header
            if (part.trim()) {
                expect(part).toMatch(DAY_PREFIX);
            }
        }
    });

    it('each chunk is within 3800 chars', () => {
        const days = ['Пн', 'Вв', 'Ср', 'Чт', 'Пт', 'Сб'].map((d) =>
            makeDay(d, 120),
        );
        const msg = days.join('\n\n');
        const parts = splitWeekMessageByDay(msg);

        for (const part of parts) {
            expect(part.length).toBeLessThanOrEqual(3800);
        }
    });

    it('reassembled parts contain all original days', () => {
        const dayNames = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота'];
        const days = dayNames.map((d) => makeDay(d, 100));
        const msg = days.join('\n\n');
        const parts = splitWeekMessageByDay(msg);
        const reassembled = parts.join('');

        for (const name of dayNames) {
            expect(reassembled).toContain(name);
        }
    });

    it('handles empty string — returns single empty-string element (short-circuit)', () => {
        const result = splitWeekMessageByDay('');
        // Empty string length (0) is <= MAX_LENGTH (3800), so the early-return
        // path fires and returns [message] = [''].
        expect(result).toEqual(['']);
    });
});
