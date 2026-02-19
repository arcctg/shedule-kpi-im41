import { describe, it, expect } from 'vitest';
import {
    getUkrainianDayAbbr,
    abbrevToFullDayName,
    getTomorrow,
    parseStartMinutes,
    formatTime,
    getWeekDaysFrom,
} from '../../src/utils/date.utils';

// Helper: build a Date with a known day-of-week (local time)
function dateWithDay(jsDay: 0 | 1 | 2 | 3 | 4 | 5 | 6): Date {
    // Start from 2024-01-01 (Monday, jsDay = 1) and offset
    const base = new Date('2024-01-01T12:00:00'); // Monday
    const diff = (jsDay - base.getDay() + 7) % 7;
    const d = new Date(base);
    d.setDate(base.getDate() + diff);
    return d;
}

describe('getUkrainianDayAbbr', () => {
    it('Monday → Пн', () => {
        expect(getUkrainianDayAbbr(dateWithDay(1))).toBe('Пн');
    });

    it('Tuesday → Вв', () => {
        expect(getUkrainianDayAbbr(dateWithDay(2))).toBe('Вв');
    });

    it('Wednesday → Ср', () => {
        expect(getUkrainianDayAbbr(dateWithDay(3))).toBe('Ср');
    });

    it('Thursday → Чт', () => {
        expect(getUkrainianDayAbbr(dateWithDay(4))).toBe('Чт');
    });

    it('Friday → Пт', () => {
        expect(getUkrainianDayAbbr(dateWithDay(5))).toBe('Пт');
    });

    it('Saturday → Сб', () => {
        expect(getUkrainianDayAbbr(dateWithDay(6))).toBe('Сб');
    });

    it('Sunday → Нд', () => {
        expect(getUkrainianDayAbbr(dateWithDay(0))).toBe('Нд');
    });
});

describe('abbrevToFullDayName', () => {
    const cases: [string, string][] = [
        ['Пн', 'Понеділок'],
        ['Вв', 'Вівторок'],
        ['Ср', 'Середа'],
        ['Чт', 'Четвер'],
        ["Пт", "П'ятниця"],
        ['Сб', 'Субота'],
        ['Нд', 'Неділя'],
    ];

    for (const [abbr, full] of cases) {
        it(`${abbr} → ${full}`, () => {
            expect(abbrevToFullDayName(abbr)).toBe(full);
        });
    }

    it('returns the input unchanged for unknown abbreviations', () => {
        expect(abbrevToFullDayName('Xx')).toBe('Xx');
    });
});

describe('getTomorrow', () => {
    it('returns a date one day later', () => {
        const today = new Date('2024-03-15T10:00:00');
        const tomorrow = getTomorrow(today);
        expect(tomorrow.getDate()).toBe(16);
        expect(tomorrow.getMonth()).toBe(2); // March = 2
    });

    it('wraps month boundary correctly', () => {
        const lastDay = new Date('2024-01-31T10:00:00');
        const next = getTomorrow(lastDay);
        expect(next.getDate()).toBe(1);
        expect(next.getMonth()).toBe(1); // February = 1
    });

    it('does not mutate the input date', () => {
        const today = new Date('2024-03-15T10:00:00');
        getTomorrow(today);
        expect(today.getDate()).toBe(15);
    });
});

describe('parseStartMinutes', () => {
    it('parses HH:MM:SS format', () => {
        expect(parseStartMinutes('08:30:00')).toBe(510);
    });

    it('parses HH:MM format', () => {
        expect(parseStartMinutes('10:00')).toBe(600);
    });

    it('parses range format HH:MM-HH:MM', () => {
        expect(parseStartMinutes('08:30-10:05')).toBe(510);
    });

    it('handles midnight', () => {
        expect(parseStartMinutes('00:00:00')).toBe(0);
    });
});

describe('formatTime', () => {
    it('strips seconds from HH:MM:SS', () => {
        expect(formatTime('09:30:00')).toBe('09:30');
    });

    it('leaves HH:MM unchanged', () => {
        expect(formatTime('11:45')).toBe('11:45');
    });

    it('handles an already-formatted string', () => {
        expect(formatTime('08:00')).toBe('08:00');
    });
});

describe('getWeekDaysFrom', () => {
    it('returns full week starting Monday', () => {
        expect(getWeekDaysFrom('Пн')).toEqual(['Пн', 'Вв', 'Ср', 'Чт', 'Пт', 'Сб']);
    });

    it('returns rotated week starting Wednesday', () => {
        expect(getWeekDaysFrom('Ср')).toEqual(['Ср', 'Чт', 'Пт', 'Сб', 'Пн', 'Вв']);
    });

    it('returns full week for unknown day', () => {
        expect(getWeekDaysFrom('Xx')).toEqual(['Пн', 'Вв', 'Ср', 'Чт', 'Пт', 'Сб']);
    });
});
