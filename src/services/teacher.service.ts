import type { Lesson } from '../types/kpi.types';
import { htmlEscape } from '../utils/htmlEscape';
import { scheduleService } from './schedule.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeacherEntry {
    /** Unique lecturer identifier from the API */
    id: string;
    name: string;
    type: string;
}

export interface TeacherResult {
    subjectName: string;
    type: string | null;
    teachers: TeacherEntry[];
}

// ─── Regex command parser ─────────────────────────────────────────────────────

const TEACHER_REGEX = /^\/teacher(?:@\w+)?\s+"([^"]+)"\s*(.*)$/i;

export type ParseTeacherResult =
    | { ok: true; subjectName: string; type: string | null }
    | { ok: false; error: string };

/**
 * Parses the raw `/teacher` command text.
 *
 * @param text  Full message text including the command, e.g. `/teacher "Назва" Лекція`
 */
export function parseTeacherCommand(text: string): ParseTeacherResult {
    const match = TEACHER_REGEX.exec(text.trim());
    if (!match) {
        return {
            ok: false,
            error:
                'Використовуйте формат:\n' +
                '/teacher "Назва предмета" [Тип]',
        };
    }

    const subjectName = match[1].trim();
    const rawType = match[2]?.trim() ?? '';
    const type = rawType.length > 0 ? rawType : null;

    return { ok: true, subjectName, type };
}

// ─── Teacher search logic ─────────────────────────────────────────────────────

const TYPE_EMOJI: Record<string, string> = {
    Лекція: '🔵',
    Практика: '🟠',
    Лаба: '🟢',
};

function normalizeType(raw: string): string {
    if (/^лек/i.test(raw)) return 'Лекція';
    if (/^прак/i.test(raw)) return 'Практика';
    if (/^лаб/i.test(raw)) return 'Лаба';
    return raw;
}

/**
 * Finds all unique lecturers for a subject across both weeks.
 * Case-insensitive match on `lesson.name`.
 * Optionally further filtered by lesson type.
 *
 * @param allLessons  Flat array of all lessons (both weeks) — caller provides this
 *                    to avoid double fetching.
 */
export function findTeachers(
    allLessons: Lesson[],
    subjectName: string,
    type: string | null,
): TeacherEntry[] {
    const nameLower = subjectName.toLowerCase();
    const typeLower = type ? type.toLowerCase() : null;

    const matched = allLessons.filter((l) => {
        if (l.name.toLowerCase() !== nameLower) return false;
        if (typeLower && !normalizeType(l.type).toLowerCase().startsWith(typeLower)) return false;
        return true;
    });

    // Deduplicate by (lecturer.id + type)
    const seen = new Map<string, TeacherEntry>();
    for (const l of matched) {
        const norm = normalizeType(l.type);
        const key = `${l.lecturer.id}_${norm}`;
        if (!seen.has(key)) {
            seen.set(key, { id: l.lecturer.id, name: l.lecturer.name, type: norm });
        }
    }

    return [...seen.values()];
}

// ─── Response formatter ───────────────────────────────────────────────────────

/**
 * Builds the HTML response for /teacher.
 */
export function formatTeacherMessage(
    subjectName: string,
    type: string | null,
    teachers: TeacherEntry[],
): string {
    const escapedName = htmlEscape(subjectName);

    if (teachers.length === 0) {
        if (type) {
            return `Для цього предмета немає занять типу "${htmlEscape(type)}".`;
        }
        return 'Предмет не знайдено.';
    }

    if (type) {
        // Filtered by type: simple list of names
        const names = teachers.map((t) => `• ${htmlEscape(t.name)}`).join('\n');
        return (
            `Предмет: <b>${escapedName}</b>\n` +
            `Тип: ${htmlEscape(type)}\n\n` +
            `Викладачі:\n${names}`
        );
    }

    // No type filter: group by lesson type with emoji
    const byType = new Map<string, string[]>();
    for (const t of teachers) {
        const existing = byType.get(t.type) ?? [];
        existing.push(htmlEscape(t.name));
        byType.set(t.type, existing);
    }

    const typeOrder = ['Лекція', 'Практика', 'Лаба'];
    const lines: string[] = [];
    for (const typeKey of typeOrder) {
        const names = byType.get(typeKey);
        if (!names) continue;
        const emoji = TYPE_EMOJI[typeKey] ?? '⚪';
        lines.push(...names.map((n) => `${emoji} ${typeKey} — ${n}`));
    }

    // Any types not in the canonical order
    for (const [typeKey, names] of byType) {
        if (typeOrder.includes(typeKey)) continue;
        const emoji = TYPE_EMOJI[typeKey] ?? '⚪';
        lines.push(...names.map((n) => `${emoji} ${typeKey} — ${n}`));
    }

    return `Предмет: <b>${escapedName}</b>\n\n${lines.join('\n')}`;
}

// ─── High-level handler ───────────────────────────────────────────────────────

/**
 * End-to-end handler: fetch lessons (cached), search, format.
 * Returns the HTML string to send.
 */
export async function handleTeacherCommand(rawText: string): Promise<string> {
    const parsed = parseTeacherCommand(rawText);
    if (!parsed.ok) return parsed.error;

    const allLessons = await scheduleService.getAllLessons();
    const teachers = findTeachers(allLessons, parsed.subjectName, parsed.type);

    return formatTeacherMessage(parsed.subjectName, parsed.type, teachers);
}
