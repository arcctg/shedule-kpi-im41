import type { Lesson, ScheduleDay } from '../types/kpi.types';
import { normalizeLessons } from './format.utils';
import { LEGEND_HEADER } from './format.utils';
import { htmlEscape } from './htmlEscape';

// ─── KPI standard lesson slot end-times ──────────────────────────────────────
//
// KPI ім. Ігоря Сікорського uses fixed 95-minute lesson slots.
// Key   = start time in "HH:MM" form (matches Lesson.time after stripping seconds)
// Value = end time  in "HH:MM" form
//
// Source: official KPI timetable (pairs 1-6)
export const SLOT_END_TIMES: Record<string, string> = {
    '08:30': '10:05',
    '10:25': '12:00',
    '12:20': '13:55',
    '14:15': '15:50',
    '16:10': '17:45',
    '18:30': '20:05',
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveLesson {
    lesson: Lesson;
    /** Display range string, e.g. "08:30-10:05" */
    timeRange: string;
    /** Minutes remaining until end of lesson (floor) */
    minutesLeft: number;
}

export interface TimeInterval {
    startHHMM: string;
    endHHMM: string;
    startMin: number;
    endMin: number;
}

// ─── Exported pure helpers (also used in tests) ───────────────────────────────

/**
 * Converts a "HH:MM" or "HH:MM:SS" string to total minutes since midnight.
 */
export function toMinutes(hhmm: string): number {
    const [hh, mm] = hhmm.split(':');
    return parseInt(hh ?? '0', 10) * 60 + parseInt(mm ?? '0', 10);
}

/**
 * Parses a raw Lesson.time value ("HH:MM:SS" or "HH:MM-HH:MM") and returns
 * the normalised start + end times, looking up the official KPI end-time slot.
 * Falls back to start + 95 minutes when the slot is not in the official map.
 */
export function parseTimeInterval(lessonTime: string): TimeInterval {
    // Strip seconds and extract start from a potential "HH:MM-HH:MM" range
    const [rawStart] = lessonTime.split('-');
    const startParts = (rawStart ?? lessonTime).split(':');
    const startHHMM = `${startParts[0] ?? '00'}:${startParts[1] ?? '00'}`;

    const knownEnd = SLOT_END_TIMES[startHHMM];
    let endHHMM: string;

    if (knownEnd) {
        endHHMM = knownEnd;
    } else {
        // Fallback: start + 95 minutes
        const totalMin = toMinutes(startHHMM) + 95;
        const hh = Math.floor(totalMin / 60).toString().padStart(2, '0');
        const mm = (totalMin % 60).toString().padStart(2, '0');
        endHHMM = `${hh}:${mm}`;
    }

    return {
        startHHMM,
        endHHMM,
        startMin: toMinutes(startHHMM),
        endMin: toMinutes(endHHMM),
    };
}

/**
 * Returns how many full minutes remain until end of lesson.
 * Returns 0 when nowMinutes >= endMinutes (should not normally happen
 * because getCurrentLesson guards this, but keeps the function safe).
 */
export function calculateMinutesLeft(endHHMM: string, nowMinutes: number): number {
    const endMin = toMinutes(endHHMM);
    return Math.max(0, Math.floor(endMin - nowMinutes));
}

/**
 * Formats the HTML reply for /now given an active lesson and an optional
 * pre-resolved DB link. Keeping the link resolution outside this function
 * keeps it pure and easy to test.
 *
 * @param active  The currently active lesson result.
 * @param link    URL from DB, or null when none is stored.
 */
export function formatNowMessage(active: ActiveLesson, link: string | null): string {
    const { lesson, timeRange, minutesLeft } = active;

    const typeEmoji =
        lesson.type.startsWith('Лек') ? '🔵'
            : lesson.type.startsWith('Прак') ? '🟠'
                : lesson.type.startsWith('Лаб') ? '🟢'
                    : '⚪';

    const escapedName = htmlEscape(lesson.name);
    const nameDisplay = link
        ? `<a href="${link}">${escapedName}</a>`
        : escapedName;

    return (
        `${LEGEND_HEADER}\n\n` +
        `Станом на зараз:\n` +
        `${timeRange}\n` +
        `${typeEmoji} ${nameDisplay}\n\n` +
        `До кінця пари: ${minutesLeft} хв`
    );
}

// ─── Kyiv clock (not exported — internal only) ────────────────────────────────

function nowKyivMinutes(): number {
    const fmt = new Intl.DateTimeFormat('uk-UA', {
        timeZone: 'Europe/Kyiv',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    return h * 60 + m;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Finds the currently active lesson on a given schedule day.
 *
 * A lesson is "active" when:
 *   currentKyivMinutes >= startMinutes && currentKyivMinutes < endMinutes
 *
 * @param scheduleDay  Today's schedule day (null when no classes today).
 * @param now          Optional override for "now" minutes — for testing.
 * @returns            ActiveLesson metadata or null if no lesson is running.
 */
export function getCurrentLesson(
    scheduleDay: ScheduleDay | null,
    now?: number,
): ActiveLesson | null {
    if (!scheduleDay || scheduleDay.pairs.length === 0) {
        return null;
    }

    const currentMin = now ?? nowKyivMinutes();
    const lessons = normalizeLessons(scheduleDay.pairs);

    for (const lesson of lessons) {
        const { startHHMM, endHHMM, startMin, endMin } = parseTimeInterval(lesson.time);

        // Active: started and not yet finished (end-time is exclusive)
        if (currentMin >= startMin && currentMin < endMin) {
            return {
                lesson,
                timeRange: `${startHHMM}-${endHHMM}`,
                minutesLeft: calculateMinutesLeft(endHHMM, currentMin),
            };
        }
    }

    return null;
}
