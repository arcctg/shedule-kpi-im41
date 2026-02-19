import { describe, it, expect, vi, beforeEach } from 'vitest';
import { htmlEscape } from '../../src/utils/htmlEscape';
import { formatDay, formatWeek, formatDayBlock, normalizeLessons } from '../../src/utils/format.utils';
import type { Lesson, ScheduleDay } from '../../src/types/kpi.types';

// Mock the DB service — we want to test formatting logic, not DB
vi.mock('../../src/database/db', () => ({
    dbService: {
        getLink: vi.fn().mockReturnValue(null),
    },
}));

// ── Fixture helpers ────────────────────────────────────────────────────────────

const makeLesson = (overrides: Partial<Lesson> = {}): Lesson => ({
    lecturer: { id: '1', name: 'Проф. Іваненко' },
    type: 'Лекція',
    time: '08:30:00',
    name: 'Математика',
    place: '402А',
    location: null,
    tag: '',
    dates: ['2024-03-01'],
    ...overrides,
});

// ── normalizeLessons ──────────────────────────────────────────────────────────

describe('normalizeLessons', () => {
    it('deduplicates lessons with the same name/type/time/place', () => {
        const lessons = [
            makeLesson({ dates: ['2024-03-01'] }),
            makeLesson({ dates: ['2024-03-08'] }),
        ];
        const result = normalizeLessons(lessons);
        expect(result).toHaveLength(1);
        expect(result[0]?.dates).toContain('2024-03-01');
        expect(result[0]?.dates).toContain('2024-03-08');
    });

    it('keeps lessons with different types as separate entries', () => {
        const lessons = [
            makeLesson({ type: 'Лекція' }),
            makeLesson({ type: 'Практика' }),
        ];
        expect(normalizeLessons(lessons)).toHaveLength(2);
    });

    it('sorts by start time', () => {
        const lessons = [
            makeLesson({ name: 'Б', time: '10:05:00' }),
            makeLesson({ name: 'А', time: '08:30:00' }),
        ];
        const result = normalizeLessons(lessons);
        expect(result[0]?.name).toBe('А');
        expect(result[1]?.name).toBe('Б');
    });
});

// ── formatDayBlock ────────────────────────────────────────────────────────────

describe('formatDayBlock', () => {
    it('includes day header with ⬜⬜⬜', () => {
        const result = formatDayBlock('Пн', []);
        expect(result).toContain('⬜⬜⬜');
        expect(result).toContain('Понеділок');
    });

    it('shows "Пар немає" when pairs is empty', () => {
        const result = formatDayBlock('Пн', []);
        expect(result).toContain('Пар немає');
    });

    it('shows lesson emoji 🔵 for Лекція', () => {
        const result = formatDayBlock('Пн', [makeLesson({ type: 'Лекція' })]);
        expect(result).toContain('🔵');
    });

    it('shows emoji 🟠 for Практика', () => {
        const result = formatDayBlock('Пн', [makeLesson({ type: 'Практика' })]);
        expect(result).toContain('🟠');
    });

    it('shows emoji 🟢 for Лаба', () => {
        const result = formatDayBlock('Пн', [makeLesson({ type: 'Лабораторна' })]);
        expect(result).toContain('🟢');
    });

    it('HTML-escapes lesson name before rendering', () => {
        const name = '<script>alert(1)</script>';
        const result = formatDayBlock('Пн', [makeLesson({ name })]);
        // The raw name should NOT appear in output
        expect(result).not.toContain('<script>');
        // The escaped version should be present
        expect(result).toContain(htmlEscape(name));
    });

    it('renders anchor tag when DB has a link', async () => {
        const { dbService } = await import('../../src/database/db');
        vi.mocked(dbService.getLink).mockReturnValueOnce('https://zoom.us/j/123');
        const result = formatDayBlock('Пн', [makeLesson()]);
        expect(result).toContain('<a href="https://zoom.us/j/123">');
    });

    it('renders plain text when DB has no link', () => {
        const result = formatDayBlock('Пн', [makeLesson()]);
        expect(result).not.toContain('<a href=');
        expect(result).toContain('Математика');
    });
});

// ── formatDay ────────────────────────────────────────────────────────────────

describe('formatDay', () => {
    it('includes the legend header', () => {
        const result = formatDay('Пн', []);
        expect(result).toContain('ІМ-41');
    });

    it('includes the day block', () => {
        const result = formatDay('Вв', [makeLesson()]);
        expect(result).toContain('Вівторок');
    });
});

// ── formatWeek ───────────────────────────────────────────────────────────────

describe('formatWeek', () => {
    it('includes all provided days', () => {
        const days: ScheduleDay[] = [
            { day: 'Пн', pairs: [makeLesson()] },
            { day: 'Вв', pairs: [] },
        ];
        const result = formatWeek(days);
        expect(result).toContain('Понеділок');
        expect(result).toContain('Вівторок');
    });

    it('includes legend header', () => {
        const result = formatWeek([]);
        expect(result).toContain('ІМ-41');
    });
});
