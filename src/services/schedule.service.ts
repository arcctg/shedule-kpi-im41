import axios from 'axios';
import NodeCache from 'node-cache';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { KPIScheduleResponse, ScheduleDay } from '../types/kpi.types';

const cache = new NodeCache({ stdTTL: config.cache.ttl });

const CACHE_KEYS = {
    schedule: `schedule_${config.kpi.groupId}`,
    activeWeek: 'active_week',
} as const;

/**
 * Fallback: determines week parity from ISO week number.
 * Odd ISO week → 1, Even → 2.
 */
export function getAutoWeekNumber(): 1 | 2 {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 4);
    const startDay = startOfYear.getDay() || 7;
    const startOfWeek1 = new Date(startOfYear);
    startOfWeek1.setDate(startOfYear.getDate() - (startDay - 1));
    const diffMs = now.getTime() - startOfWeek1.getTime();
    const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    const isoWeek = diffWeeks + 1;
    return isoWeek % 2 === 1 ? 1 : 2;
}

async function fetchSchedule(): Promise<KPIScheduleResponse> {
    const cached = cache.get<KPIScheduleResponse>(CACHE_KEYS.schedule);
    if (cached) {
        logger.debug('Schedule loaded from cache');
        return cached;
    }

    logger.info(`Fetching schedule for groupId=${config.kpi.groupId}`);
    let data: KPIScheduleResponse;
    try {
        const response = await axios.get<KPIScheduleResponse>(
            `${config.kpi.apiBase}/lessons`,
            { params: { groupId: config.kpi.groupId }, timeout: 5_000 },
        );
        data = response.data;
    } catch (err) {
        logger.error('[AXIOS_TIMEOUT] Failed to fetch schedule from KPI API:', err);
        throw err; // do not cache; bubble up so commands reply with an error message
    }

    cache.set(CACHE_KEYS.schedule, data);
    return data;
}

/**
 * Fetches the active week number from the KPI time API.
 * Falls back to ISO-week parity calculation if the request fails.
 */
export async function fetchActiveWeek(): Promise<1 | 2> {
    const cached = cache.get<1 | 2>(CACHE_KEYS.activeWeek);
    if (cached) {
        logger.debug(`Active week from cache: ${cached}`);
        return cached;
    }

    try {
        logger.info('Fetching current week from KPI time API');
        const { data } = await axios.get<{ currentWeek: number }>(
            `${config.kpi.timeApiBase}/current`,
            { timeout: 5_000 },
        );

        const w = data.currentWeek;
        const week: 1 | 2 = w === 1 || w === 2 ? w : getAutoWeekNumber();

        cache.set(CACHE_KEYS.activeWeek, week, 300);
        return week;
    } catch (err) {
        logger.warn('[AXIOS_TIMEOUT] Failed to fetch current week, using ISO week parity fallback:', err);
        return getAutoWeekNumber();
    }
}

export function getLessonsForDay(days: ScheduleDay[], dayName: string): ScheduleDay | undefined {
    return days.find(
        (d) => d.day.trim().toLowerCase() === dayName.trim().toLowerCase(),
    );
}

export const scheduleService = {
    async getWeekSchedule(week: 1 | 2): Promise<ScheduleDay[]> {
        const schedule = await fetchSchedule();
        logger.debug(`Using week: ${week}`);
        return week === 1 ? schedule.scheduleFirstWeek : schedule.scheduleSecondWeek;
    },

    async getScheduleForDay(dayName: string, week: 1 | 2): Promise<ScheduleDay | null> {
        const days = await this.getWeekSchedule(week);
        return getLessonsForDay(days, dayName) ?? null;
    },

    /**
     * Returns all lessons from both weeks in a single cached API call.
     * Used by /teacher to search across the full schedule.
     */
    async getAllLessons(): Promise<import('../types/kpi.types').Lesson[]> {
        const schedule = await fetchSchedule();
        const allDays = [
            ...schedule.scheduleFirstWeek,
            ...schedule.scheduleSecondWeek,
        ];
        return allDays.flatMap((day) => day.pairs);
    },

    clearCache(): void {
        cache.flushAll();
        logger.info('Schedule cache cleared');
    },
};
