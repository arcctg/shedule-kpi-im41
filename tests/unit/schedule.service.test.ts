import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { scheduleService, fetchActiveWeek, getAutoWeekNumber } from '../../src/services/schedule.service';
import type { KPIScheduleResponse } from '../../src/types/kpi.types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeLesson = (name: string, time = '08:30:00', type = 'Лекція') => ({
    lecturer: { id: '1', name: 'Test Prof' },
    type,
    time,
    name,
    place: '402А',
    location: null,
    tag: '',
    dates: ['2024-03-01'],
});

const mockScheduleResponse: KPIScheduleResponse = {
    groupCode: 'IM-41',
    scheduleFirstWeek: [
        { day: 'Пн', pairs: [makeLesson('Математика'), makeLesson('Фізика', '10:05:00')] },
        { day: 'Вв', pairs: [makeLesson('Хімія', '08:30:00')] },
    ],
    scheduleSecondWeek: [
        { day: 'Пн', pairs: [makeLesson('Алгебра', '13:30:00')] },
    ],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('schedule.service', () => {
    let mock: MockAdapter;

    beforeEach(() => {
        mock = new MockAdapter(axios);
        // Clear node-cache between tests
        scheduleService.clearCache();
    });

    afterEach(() => {
        mock.restore();
    });

    // ── getAutoWeekNumber ───────────────────────────────────────────────────

    describe('getAutoWeekNumber', () => {
        it('returns 1 or 2', () => {
            const week = getAutoWeekNumber();
            expect([1, 2]).toContain(week);
        });
    });

    // ── getWeekSchedule ─────────────────────────────────────────────────────

    describe('getWeekSchedule', () => {
        it('returns scheduleFirstWeek for week 1', async () => {
            mock.onGet(/\/lessons/).reply(200, mockScheduleResponse);
            const days = await scheduleService.getWeekSchedule(1);
            expect(days).toEqual(mockScheduleResponse.scheduleFirstWeek);
        });

        it('returns scheduleSecondWeek for week 2', async () => {
            mock.onGet(/\/lessons/).reply(200, mockScheduleResponse);
            const days = await scheduleService.getWeekSchedule(2);
            expect(days).toEqual(mockScheduleResponse.scheduleSecondWeek);
        });

        it('uses cache on second call (axios called only once)', async () => {
            mock.onGet(/\/lessons/).reply(200, mockScheduleResponse);
            await scheduleService.getWeekSchedule(1);
            await scheduleService.getWeekSchedule(1);
            expect(mock.history['get']?.length).toBe(1);
        });

        it('throws when axios errors (and does not cache the error)', async () => {
            mock.onGet(/\/lessons/).networkError();
            await expect(scheduleService.getWeekSchedule(1)).rejects.toThrow();

            // After error, cache should be empty → next success should work
            mock.reset();
            mock.onGet(/\/lessons/).reply(200, mockScheduleResponse);
            const days = await scheduleService.getWeekSchedule(1);
            expect(days).toEqual(mockScheduleResponse.scheduleFirstWeek);
        });

        it('throws on HTTP 500 from API', async () => {
            mock.onGet(/\/lessons/).reply(500);
            await expect(scheduleService.getWeekSchedule(1)).rejects.toThrow();
        });
    });

    // ── getScheduleForDay ───────────────────────────────────────────────────

    describe('getScheduleForDay', () => {
        beforeEach(() => {
            mock.onGet(/\/lessons/).reply(200, mockScheduleResponse);
        });

        it('returns the correct day', async () => {
            const day = await scheduleService.getScheduleForDay('Пн', 1);
            expect(day?.day).toBe('Пн');
            expect(day?.pairs).toHaveLength(2);
        });

        it('returns null for a day with no classes', async () => {
            const day = await scheduleService.getScheduleForDay('Сб', 1);
            expect(day).toBeNull();
        });

        it('is case-insensitive for day matching', async () => {
            const day = await scheduleService.getScheduleForDay('пн', 1);
            expect(day?.day).toBe('Пн');
        });
    });

    // ── fetchActiveWeek ─────────────────────────────────────────────────────

    describe('fetchActiveWeek', () => {
        beforeEach(() => {
            scheduleService.clearCache();
        });

        it('falls back to ISO parity when status API returns an array', async () => {
            mock.onGet(/\/status/).reply(200, [{ id: '1', groupName: 'IM-41', updated: '' }]);
            const week = await fetchActiveWeek();
            expect([1, 2]).toContain(week);
        });

        it('uses currentWeek from status API when it is 1', async () => {
            mock.onGet(/\/status/).reply(200, { currentWeek: 1 });
            const week = await fetchActiveWeek();
            expect(week).toBe(1);
        });

        it('uses currentWeek from status API when it is 2', async () => {
            scheduleService.clearCache();
            mock.onGet(/\/status/).reply(200, { currentWeek: 2 });
            const week = await fetchActiveWeek();
            expect(week).toBe(2);
        });

        it('falls back to ISO parity when status API fails', async () => {
            mock.onGet(/\/status/).networkError();
            const week = await fetchActiveWeek();
            expect([1, 2]).toContain(week);
        });
    });
});
