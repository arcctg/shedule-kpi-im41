// KPI API Types

export interface KPIScheduleResponse {
    groupCode: string;
    scheduleFirstWeek: ScheduleDay[];
    scheduleSecondWeek: ScheduleDay[];
}

export interface ScheduleDay {
    /** Abbreviated Ukrainian day name: "Пн", "Вв", "Ср", "Чт", "Пт", "Сб" */
    day: string;
    pairs: Lesson[];
}

export interface Lesson {
    lecturer: {
        id: string;
        name: string;
    };
    type: string;
    /** Format: "HH:MM:SS" e.g. "08:30:00" */
    time: string;
    name: string;
    place?: string;
    location: string | null;
    tag: string;
    dates: string[];
}

/**
 * Real /schedule/status response is an array of group status objects.
 */
export interface ScheduleStatusItem {
    id: string;
    groupName: string;
    updated: string;
}

export interface LessonLink {
    lesson_name: string;
    lesson_type: string;
    link: string;
}

/** Canonical lesson type labels used as DB keys */
export const LESSON_TYPE_LABELS = {
    lec: 'Лекція',
    prac: 'Практика',
    lab: 'Лаба',
} as const;

export type LessonTypeLabel = (typeof LESSON_TYPE_LABELS)[keyof typeof LESSON_TYPE_LABELS];
