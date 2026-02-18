import axios from 'axios';
import NodeCache from 'node-cache';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { KPIScheduleResponse, ScheduleDay, ScheduleStatusItem } from '../types/kpi.types';

const cache = new NodeCache({ stdTTL: config.cache.ttl });

const CACHE_KEYS = {
    schedule: `schedule_${config.kpi.groupId}`,
    status: `status_${config.kpi.groupId}`,
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
    const { data } = await axios.get<KPIScheduleResponse>(
        `${config.kpi.apiBase}/lessons`,
        { params: { groupId: config.kpi.groupId }, timeout: 10_000 },
    );

    cache.set(CACHE_KEYS.schedule, data);
    return data;
}

/**
 * Fetches the active week number from the status API.
 * The status API returns an array; we look for a `currentWeek` field.
 * If unavailable, falls back to ISO-week parity calculation.
 */
export async function fetchActiveWeek(): Promise<1 | 2> {
    const cached = cache.get<1 | 2>(CACHE_KEYS.status);
    if (cached) {
        logger.debug(`Active week from cache: ${cached}`);
        return cached;
    }

    try {
        logger.info(`Fetching schedule status for groupId=${config.kpi.groupId}`);
        const { data } = await axios.get<ScheduleStatusItem[] | { currentWeek?: number }>(
            `${config.kpi.apiBase}/status`,
            { params: { groupId: config.kpi.groupId }, timeout: 10_000 },
        );

        let week: 1 | 2 = getAutoWeekNumber();

        // Handle both array and object responses
        if (Array.isArray(data)) {
            // Real API returns array — no currentWeek, fall back to ISO parity
            logger.debug('Status API returned array — using ISO week parity fallback');
        } else if (typeof data === 'object' && data !== null && 'currentWeek' in data) {
            const w = data.currentWeek;
            if (w === 1 || w === 2) week = w;
        }

        cache.set(CACHE_KEYS.status, week, 300);
        return week;
    } catch (err) {
        logger.warn('Failed to fetch status, using ISO week parity fallback:', err);
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

    clearCache(): void {
        cache.flushAll();
        logger.info('Schedule cache cleared');
    },
};
