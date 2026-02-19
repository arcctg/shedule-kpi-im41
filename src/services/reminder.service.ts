import cron from 'node-cron';
import type { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { scheduleService, fetchActiveWeek } from './schedule.service';
import { dbService } from '../database/db';
import { getUkrainianDayAbbr } from '../utils/date.utils';
import { parseTimeInterval } from '../utils/currentLesson';
import { htmlEscape } from '../utils/htmlEscape';
import { normalizeLessons } from '../utils/format.utils';
import type { NotificationRepo } from '../database/notificationRepo';

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_MINUTES = 10;
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 60;

/** Tolerance window: ±30 seconds in minutes (as a fraction). */
const TOLERANCE_MIN = 0.5;

// ─── Duplicate-trigger guard ──────────────────────────────────────────────────

/** In-memory set of already-sent reminder keys. */
const triggeredReminders = new Set<string>();

/** Reset the set daily — called by the midnight cron. */
export function resetTriggeredReminders(): void {
    triggeredReminders.clear();
    logger.debug('[REMINDER] Triggered reminders set cleared.');
}

/** Exposed for tests. */
export function getTriggeredReminders(): ReadonlySet<string> {
    return triggeredReminders;
}

// ─── Kyiv "now" helper ────────────────────────────────────────────────────────

/**
 * Returns current Europe/Kyiv time as { h, m, totalMinutes }.
 * Uses Intl.DateTimeFormat — no external library.
 */
export function getNowKyiv(): { h: number; m: number; totalMinutes: number } {
    const fmt = new Intl.DateTimeFormat('uk-UA', {
        timeZone: 'Europe/Kyiv',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });
    const parts = fmt.formatToParts(new Date());
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
    return { h, m, totalMinutes: h * 60 + m };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export type ParseMinutesResult =
    | { ok: true; minutes: number }
    | { ok: false; error: string };

/**
 * Validates the optional argument to /enable.
 * Returns the parsed integer or an error message.
 */
export function parseMinutesArg(raw: string): ParseMinutesResult {
    const trimmed = raw.trim();
    if (trimmed === '') return { ok: true, minutes: DEFAULT_MINUTES };

    const n = Number(trimmed);
    if (!Number.isInteger(n) || isNaN(n)) {
        return { ok: false, error: 'Вкажіть кількість хвилин від 1 до 60.' };
    }
    if (n < MIN_MINUTES || n > MAX_MINUTES) {
        return { ok: false, error: 'Вкажіть кількість хвилин від 1 до 60.' };
    }
    return { ok: true, minutes: n };
}

// ─── Toggle logic ─────────────────────────────────────────────────────────────

export interface ToggleResult {
    enabled: boolean;
    minutesBefore: number;
}

/**
 * Toggles or sets reminder for a user.
 *
 * - No arg → toggle: if off → on (10 min), if on → off.
 * - Arg provided → always enable with that value.
 *
 * @returns The new state so the caller can reply appropriately.
 */
export function toggleReminder(
    repo: NotificationRepo,
    userId: number,
    minutesBefore?: number,
): ToggleResult {
    const existing = repo.get(userId);

    if (minutesBefore !== undefined) {
        // Explicit minutes → always enable
        repo.upsert(userId, true, minutesBefore);
        return { enabled: true, minutesBefore };
    }

    // Toggle
    if (!existing || existing.enabled === 0) {
        repo.upsert(userId, true, DEFAULT_MINUTES);
        return { enabled: true, minutesBefore: DEFAULT_MINUTES };
    } else {
        repo.upsert(userId, false, existing.minutes_before);
        return { enabled: false, minutesBefore: existing.minutes_before };
    }
}

// ─── Lesson reminder format ───────────────────────────────────────────────────

/**
 * Builds the plain→HTML reminder message for a lesson pair.
 * Looks up the DB link for click-ability.
 */
export function formatReminderMessage(
    minutesBefore: number,
    timeRange: string,
    lessonName: string,
    lessonType: string,
    typeEmoji: string,
): string {
    const dbLabel =
        lessonType.startsWith('Лек') ? 'Лекція'
            : lessonType.startsWith('Прак') ? 'Практика'
                : lessonType.startsWith('Лаб') ? 'Лаба'
                    : lessonType;

    const link = dbService.getLink(lessonName, dbLabel);
    const escapedName = htmlEscape(lessonName);
    const nameDisplay = link ? `<a href="${link}">${escapedName}</a>` : escapedName;

    return (
        `Через ${minutesBefore} хв починається:\n\n` +
        `${timeRange}\n` +
        `${typeEmoji} ${nameDisplay}`
    );
}

// ─── Core scheduler tick ──────────────────────────────────────────────────────

/**
 * Checks all enabled users and sends reminders for lessons that start in
 * approximately `user.minutes_before` minutes (±30 s tolerance).
 *
 * Designed to be called every minute by node-cron.
 * Accepts an optional `nowOverride` of total Kyiv minutes for testing.
 */
export async function checkAndSendReminders(
    bot: Telegraf,
    repo: NotificationRepo,
    nowOverride?: number,
): Promise<void> {
    const subscribers = repo.getAllEnabled();
    if (subscribers.length === 0) return;

    let week: 1 | 2;
    let dayAbbr: string;
    let scheduleDay: Awaited<ReturnType<typeof scheduleService.getScheduleForDay>>;

    try {
        week = await fetchActiveWeek();
        dayAbbr = getUkrainianDayAbbr(new Date());
        scheduleDay = await scheduleService.getScheduleForDay(dayAbbr, week);
    } catch {
        logger.warn('[REMINDER] KPI API unavailable — skipping reminder check.');
        return;
    }

    if (!scheduleDay || scheduleDay.pairs.length === 0) return;

    const nowMin = nowOverride ?? getNowKyiv().totalMinutes;
    const lessons = normalizeLessons(scheduleDay.pairs);

    for (const user of subscribers) {
        for (const lesson of lessons) {
            const { startHHMM, endHHMM, startMin } = parseTimeInterval(lesson.time);

            // Already started → skip
            if (nowMin >= startMin) continue;

            const minutesUntilStart = startMin - nowMin;

            // Check if within ±0.5 min of the configured offset
            if (Math.abs(minutesUntilStart - user.minutes_before) >= TOLERANCE_MIN) continue;

            // De-duplicate
            const today = dayAbbr;
            const key = `${user.user_id}_${lesson.name}_${startHHMM}_${today}`;
            if (triggeredReminders.has(key)) continue;
            triggeredReminders.add(key);

            const typeEmoji =
                lesson.type.startsWith('Лек') ? '🔵'
                    : lesson.type.startsWith('Прак') ? '🟠'
                        : lesson.type.startsWith('Лаб') ? '🟢'
                            : '⚪';

            const text = formatReminderMessage(
                user.minutes_before,
                `${startHHMM}-${endHHMM}`,
                lesson.name,
                lesson.type,
                typeEmoji,
            );

            try {
                await bot.telegram.sendMessage(user.user_id, text, { parse_mode: 'HTML' });
                logger.info(`[REMINDER] Sent to userId=${user.user_id}: ${lesson.name} at ${startHHMM}`);
            } catch (err) {
                logger.error(`[REMINDER] Failed to send to userId=${user.user_id}:`, err);
            }
        }
    }
}

// ─── Service factory ──────────────────────────────────────────────────────────

export function createReminderService(bot: Telegraf, repo: NotificationRepo) {
    return {
        /**
         * Starts the every-minute reminder cron and the midnight reset cron.
         * Safe to call multiple times — node-cron handles dedup internally.
         */
        start(): void {
            // Every minute: check and send
            cron.schedule('* * * * *', () => {
                void checkAndSendReminders(bot, repo);
            }, { timezone: 'Europe/Kyiv' });

            // Every day at 00:00: clear dedup set
            cron.schedule('0 0 * * *', () => {
                resetTriggeredReminders();
            }, { timezone: 'Europe/Kyiv' });

            logger.info('[REMINDER] Scheduler started.');
        },

        toggleReminder(userId: number, minutesBefore?: number): ToggleResult {
            return toggleReminder(repo, userId, minutesBefore);
        },
    };
}

export type ReminderService = ReturnType<typeof createReminderService>;
