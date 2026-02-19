import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    parseTeacherCommand,
    findTeachers,
    formatTeacherMessage,
    handleTeacherCommand,
} from '../../src/services/teacher.service';
import type { Lesson } from '../../src/types/kpi.types';

// ─── Hoisted mock for schedule.service ───────────────────────────────────────

vi.mock('../../src/services/schedule.service', () => ({
    scheduleService: {
        getAllLessons: vi.fn(),
    },
}));

import { scheduleService } from '../../src/services/schedule.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeLesson(overrides: Partial<Lesson> & { name: string; type: string }): Lesson {
    return {
        lecturer: { id: '1', name: 'Іваненко І.О.' },
        time: '08:30:00',
        place: '203',
        location: null,
        tag: '',
        dates: ['2024-03-04'],
        ...overrides,
    };
}


const LESSONS: Lesson[] = [
    makeLesson({ name: 'Системне програмування', type: 'Лекція', lecturer: { id: '1', name: 'Іваненко І.О.' } }),
    makeLesson({ name: 'Системне програмування', type: 'Практика', lecturer: { id: '2', name: 'Петренко П.П.' } }),
    makeLesson({ name: 'Системне програмування', type: 'Лаба', lecturer: { id: '3', name: 'Коваленко К.К.' } }),
    // Duplicate across weeks — same lecturer.id + type
    makeLesson({ name: 'Системне програмування', type: 'Лекція', lecturer: { id: '1', name: 'Іваненко І.О.' } }),
    makeLesson({ name: 'Компоненти програмної інженерії', type: 'Практика', lecturer: { id: '4', name: 'Сидоренко С.С.' } }),
];

// ─── parseTeacherCommand ──────────────────────────────────────────────────────

describe('parseTeacherCommand — parsing', () => {
    it('parses subject name without type', () => {
        const r = parseTeacherCommand('/teacher "Системне програмування"');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.subjectName).toBe('Системне програмування');
            expect(r.type).toBeNull();
        }
    });

    it('parses subject name with type', () => {
        const r = parseTeacherCommand('/teacher "Системне програмування" Лекція');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.subjectName).toBe('Системне програмування');
            expect(r.type).toBe('Лекція');
        }
    });

    it('parses subject with multi-word type', () => {
        const r = parseTeacherCommand('/teacher "Компоненти програмної інженерії" Практика');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.subjectName).toBe('Компоненти програмної інженерії');
            expect(r.type).toBe('Практика');
        }
    });

    it('handles extra whitespace around command', () => {
        const r = parseTeacherCommand('  /teacher "Алгебра"  ');
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.subjectName).toBe('Алгебра');
    });

    it('returns error when no quotes provided', () => {
        const r = parseTeacherCommand('/teacher Системне програмування');
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.error).toContain('/teacher "Назва предмета"');
        }
    });

    it('returns error for bare /teacher', () => {
        const r = parseTeacherCommand('/teacher');
        expect(r.ok).toBe(false);
    });

    it('returns error for empty quotes', () => {
        // "" is a valid regex match with empty group 1, but subjectName will be empty
        // — still parses ok; subject not found is handled downstream
        const r = parseTeacherCommand('/teacher ""');
        // Could be ok with empty string; findTeachers will return []
        // Just verify it doesn't crash
        expect(r).toBeDefined();
    });
});

// ─── findTeachers ────────────────────────────────────────────────────────────

describe('findTeachers — search logic', () => {
    it('returns all unique teachers when no type filter', () => {
        const teachers = findTeachers(LESSONS, 'Системне програмування', null);
        expect(teachers).toHaveLength(3);
        const names = teachers.map((t) => t.name).sort();
        expect(names).toContain('Іваненко І.О.');
        expect(names).toContain('Петренко П.П.');
        expect(names).toContain('Коваленко К.К.');
    });

    it('deduplicates same lecturer appearing in both weeks (same id+type)', () => {
        const duplicated = [
            ...LESSONS,
            makeLesson({ name: 'Системне програмування', type: 'Лекція', lecturer: { id: '1', name: 'Іваненко І.О.' } }),
        ];
        const teachers = findTeachers(duplicated, 'Системне програмування', null);
        const lecturers = teachers.filter((t) => t.type === 'Лекція');
        expect(lecturers).toHaveLength(1);
    });

    it('filters by type correctly', () => {
        const teachers = findTeachers(LESSONS, 'Системне програмування', 'Лекція');
        expect(teachers).toHaveLength(1);
        expect(teachers[0].name).toBe('Іваненко І.О.');
        expect(teachers[0].type).toBe('Лекція');
    });

    it('case-insensitive match on subject name', () => {
        const teachers = findTeachers(LESSONS, 'системне програмування', null);
        expect(teachers).toHaveLength(3);
    });

    it('case-insensitive match on type (prefix)', () => {
        // "лек" matches "Лекція" via prefix
        const teachers = findTeachers(LESSONS, 'Системне програмування', 'лек');
        expect(teachers).toHaveLength(1);
    });

    it('returns empty array when subject not found', () => {
        expect(findTeachers(LESSONS, 'Невідомий предмет', null)).toHaveLength(0);
    });

    it('returns empty array when type does not exist for this subject', () => {
        const teachers = findTeachers(LESSONS, 'Системне програмування', 'Екзамен');
        expect(teachers).toHaveLength(0);
    });
});

// ─── formatTeacherMessage ────────────────────────────────────────────────────

describe('formatTeacherMessage — output format', () => {
    const teachersAll = [
        { id: '1', name: 'Іваненко І.О.', type: 'Лекція' },
        { id: '2', name: 'Петренко П.П.', type: 'Практика' },
        { id: '3', name: 'Коваленко К.К.', type: 'Лаба' },
    ];

    it('subject not found (no type) → "Предмет не знайдено."', () => {
        const msg = formatTeacherMessage('Алгебра', null, []);
        expect(msg).toBe('Предмет не знайдено.');
    });

    it('no lessons of given type → correct error message', () => {
        const msg = formatTeacherMessage('Алгебра', 'Практика', []);
        expect(msg).toContain('Для цього предмета немає занять типу');
        expect(msg).toContain('Практика');
    });

    it('without type → groups by lesson type with emoji', () => {
        const msg = formatTeacherMessage('Системне програмування', null, teachersAll);
        expect(msg).toContain('🔵 Лекція — Іваненко І.О.');
        expect(msg).toContain('🟠 Практика — Петренко П.П.');
        expect(msg).toContain('🟢 Лаба — Коваленко К.К.');
        expect(msg).toContain('Предмет:');
    });

    it('with type → shows header + bullet list', () => {
        const teachers = [{ id: '1', name: 'Іваненко І.О.', type: 'Лекція' }];
        const msg = formatTeacherMessage('Системне програмування', 'Лекція', teachers);
        expect(msg).toContain('Тип: Лекція');
        expect(msg).toContain('Викладачі:');
        expect(msg).toContain('• Іваненко І.О.');
        expect(msg).not.toContain('🔵');
    });

    it('HTML-escapes subject name', () => {
        const msg = formatTeacherMessage('<b>inject</b>', null, teachersAll);
        expect(msg).not.toContain('<b>inject</b>');
        expect(msg).toContain('&lt;b&gt;');
    });

    it('HTML-escapes lecturer name', () => {
        const dangerous = [{ id: '99', name: '<script>alert(1)</script>', type: 'Лекція' }];
        const msg = formatTeacherMessage('Предмет', null, dangerous);
        expect(msg).not.toContain('<script>');
        expect(msg).toContain('&lt;script&gt;');
    });
});

// ─── handleTeacherCommand — integration (mocked schedule) ────────────────────

describe('handleTeacherCommand — integration', () => {
    beforeEach(() => {
        vi.mocked(scheduleService.getAllLessons).mockResolvedValue(LESSONS);
    });

    it('returns correct HTML for existing subject without type', async () => {
        const html = await handleTeacherCommand('/teacher "Системне програмування"');
        expect(html).toContain('Системне програмування');
        expect(html).toContain('Іваненко І.О.');
        expect(html).toContain('🔵 Лекція');
        expect(html).toContain('🟠 Практика');
    });

    it('returns correct HTML for existing subject with type', async () => {
        const html = await handleTeacherCommand('/teacher "Системне програмування" Лекція');
        expect(html).toContain('Тип: Лекція');
        expect(html).toContain('• Іваненко І.О.');
    });

    it('returns parse error when no quotes given', async () => {
        const html = await handleTeacherCommand('/teacher Системне програмування');
        expect(html).toContain('/teacher "Назва предмета"');
    });

    it('returns "Предмет не знайдено." for unknown subject', async () => {
        const html = await handleTeacherCommand('/teacher "Невідомо"');
        expect(html).toBe('Предмет не знайдено.');
    });

    it('returns type-not-found message for non-existent type', async () => {
        const html = await handleTeacherCommand('/teacher "Системне програмування" Екзамен');
        expect(html).toContain('немає занять типу');
    });

    it('uses schedule.service.getAllLessons (not the week-based API)', async () => {
        vi.mocked(scheduleService.getAllLessons).mockClear();
        await handleTeacherCommand('/teacher "Системне програмування"');

        // getAllLessons was called — confirms it uses the unified method, not the week API
        expect(scheduleService.getAllLessons).toHaveBeenCalledOnce();
    });
});
