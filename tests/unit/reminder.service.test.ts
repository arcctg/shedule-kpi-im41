import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    parseMinutesArg,
    toggleReminder,
    checkAndSendReminders,
    formatReminderMessage,
    resetTriggeredReminders,
    DEFAULT_MINUTES,
} from '../../src/services/reminder.service';
import { createNotificationRepo } from '../../src/database/notificationRepo';
import { createTestDatabase } from '../helpers/db.helper';
import type { Telegraf } from 'telegraf';
import type { ScheduleDay, Lesson } from '../../src/types/kpi.types';

// ─── Module-level hoisted mocks ───────────────────────────────────────────────

vi.mock('../../src/services/schedule.service', () => ({
    fetchActiveWeek: vi.fn().mockResolvedValue(1 as 1 | 2),
    scheduleService: {
        getScheduleForDay: vi.fn(),
    },
    getLessonsForDay: vi.fn(),
    getAutoWeekNumber: vi.fn().mockReturnValue(1 as 1 | 2),
}));

vi.mock('../../src/utils/date.utils', async (importOriginal) => {
    const orig = await importOriginal<typeof import('../../src/utils/date.utils')>();
    return { ...orig, getUkrainianDayAbbr: vi.fn().mockReturnValue('Пн') };
});

import { scheduleService, fetchActiveWeek } from '../../src/services/schedule.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeLesson(overrides: Partial<Lesson> = {}): Lesson {
    return {
        lecturer: { id: '1', name: 'Проф. Тест' },
        type: 'Лекція',
        time: '12:20:00',
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

function makeRepo() {
    const db = createTestDatabase();
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_notifications (
            user_id        INTEGER PRIMARY KEY,
            enabled        INTEGER NOT NULL DEFAULT 1,
            minutes_before INTEGER NOT NULL DEFAULT 10
        )
    `);
    return createNotificationRepo(db);
}

function makeMockBot() {
    return {
        telegram: {
            sendMessage: vi.fn().mockResolvedValue(undefined),
        },
    } as unknown as Telegraf;
}

// ─── parseMinutesArg ─────────────────────────────────────────────────────────

describe('parseMinutesArg — 100% validation coverage', () => {
    it('empty string → ok with DEFAULT_MINUTES (10)', () => {
        expect(parseMinutesArg('')).toEqual({ ok: true, minutes: DEFAULT_MINUTES });
    });

    it('/enable 10 → ok 10', () => {
        expect(parseMinutesArg('10')).toEqual({ ok: true, minutes: 10 });
    });

    it('/enable 1 → ok 1 (min boundary)', () => {
        expect(parseMinutesArg('1')).toEqual({ ok: true, minutes: 1 });
    });

    it('/enable 60 → ok 60 (max boundary)', () => {
        expect(parseMinutesArg('60')).toEqual({ ok: true, minutes: 60 });
    });

    it('/enable 30 → ok 30', () => {
        expect(parseMinutesArg('30')).toEqual({ ok: true, minutes: 30 });
    });

    it('/enable 0 → error', () => {
        const r = parseMinutesArg('0');
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('1 до 60');
    });

    it('/enable 61 → error', () => {
        expect(parseMinutesArg('61').ok).toBe(false);
    });

    it('/enable -5 → error', () => {
        expect(parseMinutesArg('-5').ok).toBe(false);
    });

    it('/enable abc → error (non-integer)', () => {
        const r = parseMinutesArg('abc');
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toContain('1 до 60');
    });

    it('/enable 1.5 → error (float not allowed)', () => {
        expect(parseMinutesArg('1.5').ok).toBe(false);
    });

    it('trims whitespace before parsing', () => {
        expect(parseMinutesArg('  15  ')).toEqual({ ok: true, minutes: 15 });
    });
});

// ─── toggleReminder ──────────────────────────────────────────────────────────

describe('toggleReminder — /enable command logic', () => {
    it('/enable → enables with DEFAULT_MINUTES when no prior record', () => {
        const repo = makeRepo();
        const result = toggleReminder(repo, 1001);
        expect(result).toEqual({ enabled: true, minutesBefore: DEFAULT_MINUTES });
        expect(repo.get(1001)?.enabled).toBe(1);
    });

    it('/enable a second time → disables', () => {
        const repo = makeRepo();
        toggleReminder(repo, 1001);
        const result = toggleReminder(repo, 1001);
        expect(result.enabled).toBe(false);
        expect(repo.get(1001)?.enabled).toBe(0);
    });

    it('/enable after disable → re-enables with DEFAULT_MINUTES', () => {
        const repo = makeRepo();
        repo.upsert(1001, false, 20);
        const result = toggleReminder(repo, 1001);
        expect(result.enabled).toBe(true);
        expect(result.minutesBefore).toBe(DEFAULT_MINUTES);
    });

    it('/enable 30 → always enables with 30 even when already enabled', () => {
        const repo = makeRepo();
        toggleReminder(repo, 1001);                  // on (10 min)
        const result = toggleReminder(repo, 1001, 30); // explicit
        expect(result).toEqual({ enabled: true, minutesBefore: 30 });
        expect(repo.get(1001)?.minutes_before).toBe(30);
    });

    it('/enable 40 when disabled → enables with 40', () => {
        const repo = makeRepo();
        repo.upsert(1001, false, 10);
        const result = toggleReminder(repo, 1001, 40);
        expect(result).toEqual({ enabled: true, minutesBefore: 40 });
    });

    it('two users are tracked independently', () => {
        const repo = makeRepo();
        toggleReminder(repo, 1001);  // A: on
        toggleReminder(repo, 2002);  // B: on
        toggleReminder(repo, 1001);  // A: off

        expect(repo.get(1001)?.enabled).toBe(0);
        expect(repo.get(2002)?.enabled).toBe(1);
    });
});

// ─── checkAndSendReminders — trigger logic ────────────────────────────────────
// 12:20 = 740 min. With 10-min offset, trigger at 730.

describe('checkAndSendReminders — reminder trigger logic', () => {
    const LESSON_START_MIN = 740; // 12:20
    const BEFORE = 10;

    beforeEach(() => {
        resetTriggeredReminders();
        vi.mocked(fetchActiveWeek).mockResolvedValue(1);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('triggers when now = startTime - minutesBefore (exact match)', async () => {
        const repo = makeRepo();
        const bot = makeMockBot();
        repo.upsert(1001, true, BEFORE);

        vi.mocked(scheduleService.getScheduleForDay).mockResolvedValue(
            makeDay([makeLesson({ time: '12:20:00' })]),
        );

        await checkAndSendReminders(bot, repo, LESSON_START_MIN - BEFORE);

        expect(bot.telegram.sendMessage).toHaveBeenCalledOnce();
        const [, text] = vi.mocked(bot.telegram.sendMessage).mock.calls[0];
        expect(text).toContain('Через 10 хв');
        expect(text).toContain('12:20-13:55');
    });

    it('does NOT trigger when user is disabled', async () => {
        const repo = makeRepo();
        const bot = makeMockBot();
        repo.upsert(1001, false, BEFORE);

        vi.mocked(scheduleService.getScheduleForDay).mockResolvedValue(
            makeDay([makeLesson({ time: '12:20:00' })]),
        );

        await checkAndSendReminders(bot, repo, LESSON_START_MIN - BEFORE);
        expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('does NOT trigger when beforeMinutes is 9 (too early)', async () => {
        const repo = makeRepo();
        const bot = makeMockBot();
        repo.upsert(1001, true, BEFORE); // user wants 10 min ahead

        vi.mocked(scheduleService.getScheduleForDay).mockResolvedValue(
            makeDay([makeLesson({ time: '12:20:00' })]),
        );

        // 9 min before = now at 731, but minutesUntilStart=9, user wants 10 → diff=1, ≥ 0.5
        await checkAndSendReminders(bot, repo, LESSON_START_MIN - 9);
        expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('does NOT trigger when beforeMinutes is 11 (too late)', async () => {
        const repo = makeRepo();
        const bot = makeMockBot();
        repo.upsert(1001, true, BEFORE);

        vi.mocked(scheduleService.getScheduleForDay).mockResolvedValue(
            makeDay([makeLesson({ time: '12:20:00' })]),
        );

        await checkAndSendReminders(bot, repo, LESSON_START_MIN - 11);
        expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('dedup: second call for same lesson does NOT send again', async () => {
        const repo = makeRepo();
        const bot = makeMockBot();
        repo.upsert(1001, true, BEFORE);

        vi.mocked(scheduleService.getScheduleForDay).mockResolvedValue(
            makeDay([makeLesson({ time: '12:20:00' })]),
        );

        const nowMin = LESSON_START_MIN - BEFORE;
        await checkAndSendReminders(bot, repo, nowMin);
        await checkAndSendReminders(bot, repo, nowMin);

        expect(bot.telegram.sendMessage).toHaveBeenCalledOnce();
    });

    it('sends again after resetTriggeredReminders (midnight reset)', async () => {
        const repo = makeRepo();
        const bot = makeMockBot();
        repo.upsert(1001, true, BEFORE);

        vi.mocked(scheduleService.getScheduleForDay).mockResolvedValue(
            makeDay([makeLesson({ time: '12:20:00' })]),
        );

        const nowMin = LESSON_START_MIN - BEFORE;
        await checkAndSendReminders(bot, repo, nowMin);
        resetTriggeredReminders();
        await checkAndSendReminders(bot, repo, nowMin);

        expect(bot.telegram.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('does NOT send when lesson has already started (now >= startTime)', async () => {
        const repo = makeRepo();
        const bot = makeMockBot();
        repo.upsert(1001, true, BEFORE);

        vi.mocked(scheduleService.getScheduleForDay).mockResolvedValue(
            makeDay([makeLesson({ time: '12:20:00' })]),
        );

        await checkAndSendReminders(bot, repo, LESSON_START_MIN);
        expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('does nothing when today has no pairs (no lessons)', async () => {
        const repo = makeRepo();
        const bot = makeMockBot();
        repo.upsert(1001, true, BEFORE);

        vi.mocked(scheduleService.getScheduleForDay).mockResolvedValue(makeDay([]));

        await checkAndSendReminders(bot, repo, LESSON_START_MIN - BEFORE);
        expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('does nothing when KPI API is unavailable (graceful failure)', async () => {
        const repo = makeRepo();
        const bot = makeMockBot();
        repo.upsert(1001, true, BEFORE);

        vi.mocked(fetchActiveWeek).mockRejectedValue(new Error('Network error'));

        await checkAndSendReminders(bot, repo, LESSON_START_MIN - BEFORE);
        expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });
});

// ─── formatReminderMessage ────────────────────────────────────────────────────

describe('formatReminderMessage', () => {
    it('contains correct minutes and time range', () => {
        const msg = formatReminderMessage(10, '12:20-13:55', 'Алгоритми', 'Лекція', '🔵');
        expect(msg).toContain('Через 10 хв');
        expect(msg).toContain('12:20-13:55');
        expect(msg).toContain('🔵');
        expect(msg).toContain('Алгоритми');
    });

    it('HTML-escapes malicious lesson name', () => {
        const msg = formatReminderMessage(10, '08:30-10:05', '<b>hack</b>', 'Практика', '🟠');
        expect(msg).not.toContain('<b>');
        expect(msg).toContain('&lt;b&gt;');
    });

    it('passes through provided emoji correctly', () => {
        expect(formatReminderMessage(5, '08:30-10:05', 'X', 'Лекція', '🔵')).toContain('🔵');
        expect(formatReminderMessage(5, '08:30-10:05', 'X', 'Практика', '🟠')).toContain('🟠');
        expect(formatReminderMessage(5, '08:30-10:05', 'X', 'Лабораторна', '🟢')).toContain('🟢');
    });
});

// ─── notificationRepo — database logic ───────────────────────────────────────

describe('notificationRepo — database logic', () => {
    it('get returns null for unknown user', () => {
        const repo = makeRepo();
        expect(repo.get(9999)).toBeNull();
    });

    it('upsert creates new user row', () => {
        const repo = makeRepo();
        repo.upsert(1, true, 15);
        const row = repo.get(1);
        expect(row).not.toBeNull();
        expect(row?.enabled).toBe(1);
        expect(row?.minutes_before).toBe(15);
    });

    it('upsert updates existing row (minutes)', () => {
        const repo = makeRepo();
        repo.upsert(1, true, 10);
        repo.upsert(1, true, 25);
        expect(repo.get(1)?.minutes_before).toBe(25);
    });

    it('upsert toggles enabled from true to false', () => {
        const repo = makeRepo();
        repo.upsert(1, true, 10);
        repo.upsert(1, false, 10);
        expect(repo.get(1)?.enabled).toBe(0);
    });

    it('getAllEnabled returns only enabled rows', () => {
        const repo = makeRepo();
        repo.upsert(1, true, 10);
        repo.upsert(2, false, 5);
        repo.upsert(3, true, 30);

        const ids = repo.getAllEnabled().map((r) => r.user_id).sort((a, b) => a - b);
        expect(ids).toEqual([1, 3]);
    });

    it('getAllEnabled returns empty array when all disabled', () => {
        const repo = makeRepo();
        repo.upsert(1, false, 10);
        expect(repo.getAllEnabled()).toHaveLength(0);
    });
});
