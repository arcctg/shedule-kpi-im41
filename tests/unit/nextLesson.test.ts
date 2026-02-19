import { describe, it, expect } from 'vitest';
import {
    getNextLesson,
    formatNextMessage,
} from '../../src/utils/currentLesson';
import type { ScheduleDay, Lesson } from '../../src/types/kpi.types';
import type { NextLesson } from '../../src/utils/currentLesson';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeLesson(time: string, name: string, type: string): Lesson {
    return {
        lecturer: { id: '1', name: 'Проф. Тест' },
        type,
        time,
        name,
        place: '301',
        location: null,
        tag: '',
        dates: ['2024-03-04'],
    };
}

function makeDay(lessons: Lesson[]): ScheduleDay {
    return { day: 'Пн', pairs: lessons };
}

// ─── getNextLesson ────────────────────────────────────────────────────────────

describe('getNextLesson', () => {
    it('returns null for null scheduleDay', () => {
        expect(getNextLesson(null, 600)).toBeNull();
    });

    it('returns null for empty pairs', () => {
        expect(getNextLesson(makeDay([]), 600)).toBeNull();
    });

    it('returns next lesson when it has not started yet', () => {
        // 16:10 = 970 min; now = 960 → lesson is next
        const day = makeDay([makeLesson('16:10:00', 'Теорія ймовірностей', 'Практика')]);
        const result = getNextLesson(day, 960);
        expect(result).not.toBeNull();
        expect(result?.lesson.name).toBe('Теорія ймовірностей');
        expect(result?.timeRange).toBe('16:10-17:45');
    });

    it('returns the FIRST next lesson when multiple are upcoming', () => {
        // 08:30 = 510, 12:20 = 740. now = 400 → both are upcoming → pick 08:30
        const day = makeDay([
            makeLesson('12:20:00', 'Друга пара', 'Лекція'),
            makeLesson('08:30:00', 'Перша пара', 'Практика'),
        ]);
        const result = getNextLesson(day, 400);
        expect(result?.lesson.name).toBe('Перша пара');
        expect(result?.timeRange).toBe('08:30-10:05');
    });

    it('skips lessons that have already started (now >= startMin)', () => {
        // 08:30 = 510, now = 510 → 08:30 already started (not strictly >); 12:20 = 740 is next
        const day = makeDay([
            makeLesson('08:30:00', 'Минула пара', 'Лекція'),
            makeLesson('12:20:00', 'Наступна пара', 'Практика'),
        ]);
        const result = getNextLesson(day, 510);
        expect(result?.lesson.name).toBe('Наступна пара');
    });

    it('returns null when all lessons have already started', () => {
        // 08:30 = 510, now = 800 → all in the past
        const day = makeDay([makeLesson('08:30:00', 'Пройдена', 'Лекція')]);
        expect(getNextLesson(day, 800)).toBeNull();
    });

    it('returns null when the last lesson is currently running (startMin < now < endMin)', () => {
        // 16:10 = 970, 17:45 = 1065, now = 1000 → lesson started, none after
        const day = makeDay([makeLesson('16:10:00', 'Остання', 'Лекція')]);
        expect(getNextLesson(day, 1000)).toBeNull();
    });
});

// ─── formatNextMessage ────────────────────────────────────────────────────────

describe('formatNextMessage', () => {
    function makeNext(name: string, type: string, time = '16:10-17:45'): NextLesson {
        return {
            lesson: makeLesson(time.split('-')[0] + ':00', name, type),
            timeRange: time,
        };
    }

    it('produces correct base format without link', () => {
        const msg = formatNextMessage(makeNext('Теорія ймовірностей', 'Практика'), null);
        expect(msg).toBe('Наступна пара:\n16:10-17:45\n🟠 Теорія ймовірностей');
    });

    it('wraps name in <a href> when link is provided', () => {
        const msg = formatNextMessage(makeNext('Алгебра', 'Лекція'), 'https://zoom.us/j/123');
        expect(msg).toBe('Наступна пара:\n16:10-17:45\n🔵 <a href="https://zoom.us/j/123">Алгебра</a>');
    });

    it('does NOT include link element when link is null', () => {
        const msg = formatNextMessage(makeNext('Алгебра', 'Лекція'), null);
        expect(msg).not.toContain('<a ');
        expect(msg).toContain('Алгебра');
    });

    it('emoji: Лекція → 🔵', () => {
        expect(formatNextMessage(makeNext('X', 'Лекція'), null)).toContain('🔵');
    });

    it('emoji: Практика → 🟠', () => {
        expect(formatNextMessage(makeNext('X', 'Практика'), null)).toContain('🟠');
    });

    it('emoji: Лаба → 🟢', () => {
        expect(formatNextMessage(makeNext('X', 'Лабораторна'), null)).toContain('🟢');
    });

    it('emoji: unknown type → ⚪', () => {
        expect(formatNextMessage(makeNext('X', 'Інше'), null)).toContain('⚪');
    });

    it('HTML-escapes subject name', () => {
        const msg = formatNextMessage(makeNext('<script>alert(1)</script>', 'Лекція'), null);
        expect(msg).not.toContain('<script>');
        expect(msg).toContain('&lt;script&gt;');
    });

    it('HTML-escapes subject name even when wrapped in link', () => {
        const msg = formatNextMessage(makeNext('<b>bad</b>', 'Лекція'), 'https://example.com');
        expect(msg).toContain('&lt;b&gt;');
        expect(msg).not.toContain('<b>bad</b>');
    });
});

// ─── Integration: getNextLesson + formatNextMessage pipeline ──────────────────

describe('getNextLesson + formatNextMessage integration', () => {
    it('full pipeline: finds correct lesson and formats it with link', () => {
        const day = makeDay([
            makeLesson('08:30:00', 'Минула', 'Лекція'),
            makeLesson('16:10:00', 'Теорія ймовірностей', 'Практика'),
        ]);

        // now = 08:30 = 510 exactly → 08:30 already started, 16:10 is next
        const next = getNextLesson(day, 510);
        expect(next).not.toBeNull();

        const msg = formatNextMessage(next!, 'https://meet.google.com/abc');
        expect(msg).toBe(
            'Наступна пара:\n16:10-17:45\n🟠 <a href="https://meet.google.com/abc">Теорія ймовірностей</a>',
        );
    });

    it('full pipeline: no more lessons today', () => {
        const day = makeDay([makeLesson('08:30:00', 'Єдина пара', 'Лекція')]);
        // now = 900 → past 08:30 start
        const next = getNextLesson(day, 900);
        expect(next).toBeNull(); // bot would reply 'Сьогодні більше пар немає.'
    });

    it('full pipeline: no DB link → plain text name', () => {
        const day = makeDay([makeLesson('16:10:00', 'Матан', 'Лаба')]);
        const next = getNextLesson(day, 400);
        const msg = formatNextMessage(next!, null);
        expect(msg).toBe('Наступна пара:\n16:10-17:45\n🟢 Матан');
    });
});
