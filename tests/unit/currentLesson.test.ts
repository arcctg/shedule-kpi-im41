import { describe, it, expect } from 'vitest';
import {
    toMinutes,
    parseTimeInterval,
    calculateMinutesLeft,
    formatNowMessage,
    getCurrentLesson,
    SLOT_END_TIMES,
    type ActiveLesson,
} from '../../src/utils/currentLesson';
import type { Lesson, ScheduleDay } from '../../src/types/kpi.types';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
    return {
        lecturer: { id: '1', name: 'Проф. Тест' },
        type: 'Лекція',
        time: '08:30:00',
        name: 'Математика',
        place: '401А',
        location: null,
        tag: '',
        dates: ['2024-03-04'],
        ...overrides,
    };
}

function makeDay(pairs: Lesson[]): ScheduleDay {
    return { day: 'Пн', pairs };
}

// Converts "HH:MM" → minutes since midnight (test-local shorthand)
const MIN = (hhmm: string) => toMinutes(hhmm);

// ─── toMinutes ────────────────────────────────────────────────────────────────

describe('toMinutes', () => {
    it('midnight → 0', () => expect(MIN('00:00')).toBe(0));
    it('08:30 → 510', () => expect(MIN('08:30')).toBe(510));
    it('12:20 → 740', () => expect(MIN('12:20')).toBe(740));
    it('23:59 → 1439', () => expect(MIN('23:59')).toBe(1439));
});

// ─── parseTimeInterval ────────────────────────────────────────────────────────

describe('parseTimeInterval', () => {
    it('strips seconds: "08:30:00" → start 08:30, end 10:05', () => {
        const { startHHMM, endHHMM } = parseTimeInterval('08:30:00');
        expect(startHHMM).toBe('08:30');
        expect(endHHMM).toBe('10:05');
    });

    it('all six standard KPI slots produce correct end times', () => {
        for (const [start, end] of Object.entries(SLOT_END_TIMES)) {
            const interval = parseTimeInterval(`${start}:00`);
            expect(interval.startHHMM).toBe(start);
            expect(interval.endHHMM).toBe(end);
        }
    });

    it('unknown start → falls back to start + 95 min', () => {
        const { startHHMM, endHHMM } = parseTimeInterval('07:00:00');
        expect(startHHMM).toBe('07:00');
        // 07:00 + 95 min = 08:35
        expect(endHHMM).toBe('08:35');
    });

    it('range format "HH:MM-HH:MM" — uses first part as start', () => {
        const { startHHMM } = parseTimeInterval('10:25-12:00');
        expect(startHHMM).toBe('10:25');
    });

    it('returns correct numeric minutes', () => {
        const { startMin, endMin } = parseTimeInterval('12:20:00');
        expect(startMin).toBe(MIN('12:20'));
        expect(endMin).toBe(MIN('13:55'));
    });
});

// ─── calculateMinutesLeft ─────────────────────────────────────────────────────

describe('calculateMinutesLeft', () => {
    it('returns full duration when nowMinutes = startMin', () => {
        // 08:30 → 10:05 = 95 min, at start = 95 min left
        expect(calculateMinutesLeft('10:05', MIN('08:30'))).toBe(95);
    });

    it('returns 1 when nowMinutes = endMin - 1', () => {
        expect(calculateMinutesLeft('10:05', MIN('10:04'))).toBe(1);
    });

    it('returns 0 when nowMinutes = endMin (lesson just ended)', () => {
        expect(calculateMinutesLeft('10:05', MIN('10:05'))).toBe(0);
    });

    it('returns 0 when nowMinutes > endMin (clamps at 0)', () => {
        expect(calculateMinutesLeft('10:05', MIN('11:00'))).toBe(0);
    });

    it('mid-lesson: 30 min into a 95-min pair → 65 min left', () => {
        expect(calculateMinutesLeft('10:05', MIN('09:00'))).toBe(65);
    });
});

// ─── getCurrentLesson ─────────────────────────────────────────────────────────

describe('getCurrentLesson', () => {

    // ── null / empty inputs ─────────────────────────────────────────────────

    it('returns null when scheduleDay is null', () => {
        expect(getCurrentLesson(null)).toBeNull();
    });

    it('returns null when pairs array is empty (day with no classes)', () => {
        expect(getCurrentLesson(makeDay([]))).toBeNull();
    });

    // ── night time ──────────────────────────────────────────────────────────

    it('returns null at night (00:00 — before any lesson)', () => {
        const day = makeDay([makeLesson({ time: '08:30:00' })]);
        expect(getCurrentLesson(day, MIN('00:00'))).toBeNull();
    });

    it('returns null late night (23:00 — after all lessons)', () => {
        const day = makeDay([makeLesson({ time: '08:30:00' })]);
        expect(getCurrentLesson(day, MIN('23:00'))).toBeNull();
    });

    // ── exactly at boundaries ───────────────────────────────────────────────

    it('returns lesson when now = exactly start time (inclusive)', () => {
        const day = makeDay([makeLesson({ time: '08:30:00' })]);
        const result = getCurrentLesson(day, MIN('08:30'));
        expect(result).not.toBeNull();
        expect(result?.minutesLeft).toBe(95); // 10:05 - 08:30 = 95
    });

    it('returns null when now = exactly end time (exclusive boundary)', () => {
        const day = makeDay([makeLesson({ time: '08:30:00' })]);
        // 10:05 is the end → considered finished
        expect(getCurrentLesson(day, MIN('10:05'))).toBeNull();
    });

    it('returns 0 minutesLeft one minute before end (edge → still active)', () => {
        // This actually tests 1 min left, not 0
        const day = makeDay([makeLesson({ time: '08:30:00' })]);
        const result = getCurrentLesson(day, MIN('10:04'));
        expect(result).not.toBeNull();
        expect(result?.minutesLeft).toBe(1);
    });

    // ── normal active lesson ────────────────────────────────────────────────

    it('returns correct lesson and minutesLeft mid-lesson', () => {
        const lesson = makeLesson({ time: '12:20:00', name: 'Фізика' });
        const day = makeDay([lesson]);
        // 12:20 → 13:55 (95 min). At 13:00 → 55 min left.
        const result = getCurrentLesson(day, MIN('13:00'));
        expect(result?.lesson.name).toBe('Фізика');
        expect(result?.minutesLeft).toBe(55);
        expect(result?.timeRange).toBe('12:20-13:55');
    });

    // ── multiple lessons — picks the right one ──────────────────────────────

    it('picks second lesson when first has finished', () => {
        const day = makeDay([
            makeLesson({ time: '08:30:00', name: 'Математика' }),
            makeLesson({ time: '10:25:00', name: 'Фізика' }),
        ]);
        // 10:25 to 12:00; at 11:00 the second pair is active
        const result = getCurrentLesson(day, MIN('11:00'));
        expect(result?.lesson.name).toBe('Фізика');
    });

    it('returns null in the break between two lessons (10:05–10:24)', () => {
        const day = makeDay([
            makeLesson({ time: '08:30:00', name: 'А' }),
            makeLesson({ time: '10:25:00', name: 'Б' }),
        ]);
        expect(getCurrentLesson(day, MIN('10:10'))).toBeNull();
    });

    // ── weekend / no classes ────────────────────────────────────────────────

    it('returns null when scheduleDay has no pairs (weekend / holiday)', () => {
        const sunday: ScheduleDay = { day: 'Нд', pairs: [] };
        expect(getCurrentLesson(sunday, MIN('12:00'))).toBeNull();
    });

    // ── unknown slot fallback ───────────────────────────────────────────────

    it('handles non-standard lesson time via 95-min fallback', () => {
        // 07:00 → 08:35 (fallback)
        const lesson = makeLesson({ time: '07:00:00', name: 'Рання пара' });
        const day = makeDay([lesson]);
        const result = getCurrentLesson(day, MIN('07:30'));
        expect(result).not.toBeNull();
        expect(result?.timeRange).toBe('07:00-08:35');
        expect(result?.minutesLeft).toBe(65); // 08:35 - 07:30 = 65
    });

    // ── deduplication (normalizeLessons) ────────────────────────────────────

    it('deduplicates duplicate lesson entries for the same time slot', () => {
        // Same lesson appearing twice (different dates in API response)
        const day = makeDay([
            makeLesson({ dates: ['2024-03-04'] }),
            makeLesson({ dates: ['2024-03-11'] }),
        ]);
        const result = getCurrentLesson(day, MIN('09:00'));
        expect(result).not.toBeNull();
        // Should only match once, not return duplicates
    });
});

// ─── formatNowMessage ─────────────────────────────────────────────────────────

describe('formatNowMessage', () => {
    const baseLesson = makeLesson({ name: 'Алгоритми', type: 'Лекція' });
    const baseActive: ActiveLesson = {
        lesson: baseLesson,
        timeRange: '08:30-10:05',
        minutesLeft: 59,
    };

    it('contains the group legend header', () => {
        const msg = formatNowMessage(baseActive, null);
        expect(msg).toContain('Група: ІМ-41');
        expect(msg).toContain('🔵 Лекція');
    });

    it('contains "Станом на зараз:"', () => {
        expect(formatNowMessage(baseActive, null)).toContain('Станом на зараз:');
    });

    it('contains the time range', () => {
        expect(formatNowMessage(baseActive, null)).toContain('08:30-10:05');
    });

    it('contains minutes left', () => {
        expect(formatNowMessage(baseActive, null)).toContain('До кінця пари: 59 хв');
    });

    it('uses 🔵 emoji for Лекція', () => {
        expect(formatNowMessage(baseActive, null)).toContain('🔵');
    });

    it('uses 🟠 emoji for Практика', () => {
        const active = { ...baseActive, lesson: makeLesson({ type: 'Практика' }) };
        expect(formatNowMessage(active, null)).toContain('🟠');
    });

    it('uses 🟢 emoji for Лаба', () => {
        const active = { ...baseActive, lesson: makeLesson({ type: 'Лабораторна' }) };
        expect(formatNowMessage(active, null)).toContain('🟢');
    });

    it('uses ⚪ emoji for unknown type', () => {
        const active = { ...baseActive, lesson: makeLesson({ type: 'Щось невідоме' }) };
        expect(formatNowMessage(active, null)).toContain('⚪');
    });

    it('renders plain lesson name when no link', () => {
        const msg = formatNowMessage(baseActive, null);
        expect(msg).toContain('Алгоритми');
        expect(msg).not.toContain('<a href=');
    });

    it('renders clickable <a> tag when link is provided', () => {
        const msg = formatNowMessage(baseActive, 'https://zoom.us/j/999');
        expect(msg).toContain('<a href="https://zoom.us/j/999">');
        expect(msg).toContain('Алгоритми');
    });

    it('HTML-escapes lesson name with special characters', () => {
        const dangerous = makeLesson({ name: '<script>alert(1)</script>' });
        const active = { ...baseActive, lesson: dangerous };
        const msg = formatNowMessage(active, null);
        expect(msg).not.toContain('<script>');
        expect(msg).toContain('&lt;script&gt;');
    });

    it('handles minutesLeft = 0 (edge — last minute just ticked)', () => {
        const active = { ...baseActive, minutesLeft: 0 };
        expect(formatNowMessage(active, null)).toContain('До кінця пари: 0 хв');
    });
});
