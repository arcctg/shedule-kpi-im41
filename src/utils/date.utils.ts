/**
 * Abbreviated Ukrainian day names as returned by the KPI API.
 * Mon=0 ... Sat=5, Sun=6
 */
const UK_DAYS_ABBR: readonly string[] = [
    'Пн', // Понеділок
    'Вв', // Вівторок
    'Ср', // Середа
    'Чт', // Четвер
    'Пт', // П'ятниця
    'Сб', // Субота
    'Нд', // Неділя
];

/** Full Ukrainian day names for display */
const UK_DAYS_FULL: readonly string[] = [
    'Понеділок',
    'Вівторок',
    'Середа',
    'Четвер',
    'П\'ятниця',
    'Субота',
    'Неділя',
];

/**
 * Returns the abbreviated Ukrainian day name used by the KPI API for a given Date.
 */
export function getUkrainianDayAbbr(date: Date): string {
    const jsDay = date.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const idx = jsDay === 0 ? 6 : jsDay - 1; // Mon=0 ... Sun=6
    return UK_DAYS_ABBR[idx] as string;
}

/**
 * Returns the full Ukrainian day name for display, given an abbreviated name.
 */
export function abbrevToFullDayName(abbr: string): string {
    const idx = UK_DAYS_ABBR.indexOf(abbr);
    if (idx === -1) return abbr;
    return UK_DAYS_FULL[idx] as string;
}

/**
 * Returns tomorrow's Date relative to the given date.
 */
export function getTomorrow(date: Date): Date {
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
}

/**
 * Parses a time string like "08:30:00" or "08:30-10:05" and returns
 * the start minutes since midnight.
 */
export function parseStartMinutes(time: string): number {
    // Handle both "HH:MM:SS" and "HH:MM-HH:MM" formats
    const start = time.split('-')[0] ?? time;
    const parts = start.split(':');
    const hours = parseInt(parts[0] ?? '0', 10);
    const minutes = parseInt(parts[1] ?? '0', 10);
    return hours * 60 + minutes;
}

/**
 * Formats a time string from "HH:MM:SS" to "HH:MM" for display.
 */
export function formatTime(time: string): string {
    const parts = time.split(':');
    if (parts.length >= 2) {
        return `${parts[0]}:${parts[1]}`;
    }
    return time;
}

/**
 * Returns an array of abbreviated Ukrainian day names starting from the given
 * day (inclusive), cycling Mon–Sat (no Sunday).
 */
export function getWeekDaysFrom(startDayAbbr: string): string[] {
    const weekdays = UK_DAYS_ABBR.slice(0, 6); // Mon–Sat
    const startIdx = weekdays.indexOf(startDayAbbr);
    if (startIdx === -1) return [...weekdays];
    return [...weekdays.slice(startIdx), ...weekdays.slice(0, startIdx)];
}

// Keep for backwards compatibility
export const getUkrainianDayName = getUkrainianDayAbbr;
