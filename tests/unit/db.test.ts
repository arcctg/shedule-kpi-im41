import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { createTestDatabase } from '../helpers/db.helper';

// ── Thin wrapper that mirrors dbService but operates on an injected DB ────────
// We cannot import dbService directly (it reads config.database.path at module
// load time and opens a real file). Instead we replicate the same SQL logic
// against our in-memory test DB.

function createDbService(db: Database.Database) {
    return {
        setLink(lessonName: string, lessonType: string, link: string): void {
            db.prepare(`
                INSERT INTO lesson_links (lesson_name, lesson_type, link)
                VALUES (?, ?, ?)
                ON CONFLICT(lesson_name, lesson_type) DO UPDATE SET link = excluded.link
            `).run(lessonName, lessonType, link);
        },

        getLink(lessonName: string, lessonType: string): string | null {
            const row = db.prepare(
                'SELECT link FROM lesson_links WHERE lesson_name = ? AND lesson_type = ?',
            ).get(lessonName, lessonType) as { link: string } | undefined;
            return row?.link ?? null;
        },

        deleteLink(lessonName: string, lessonType: string): boolean {
            const result = db.prepare(
                'DELETE FROM lesson_links WHERE lesson_name = ? AND lesson_type = ?',
            ).run(lessonName, lessonType);
            return result.changes > 0;
        },

        getAllLinks(): Array<{ lesson_name: string; lesson_type: string; link: string }> {
            return db.prepare(
                'SELECT lesson_name, lesson_type, link FROM lesson_links',
            ).all() as Array<{ lesson_name: string; lesson_type: string; link: string }>;
        },
    };
}

describe('DB service (in-memory SQLite)', () => {
    let db: Database.Database;
    let service: ReturnType<typeof createDbService>;

    beforeEach(() => {
        db = createTestDatabase();
        service = createDbService(db);
    });

    // ── setLink ───────────────────────────────────────────────────────────────

    it('inserts a new link', () => {
        service.setLink('Математика', 'Лекція', 'https://example.com/1');
        expect(service.getLink('Математика', 'Лекція')).toBe('https://example.com/1');
    });

    it('updates an existing link (upsert)', () => {
        service.setLink('Математика', 'Лекція', 'https://old.com');
        service.setLink('Математика', 'Лекція', 'https://new.com');
        expect(service.getLink('Математика', 'Лекція')).toBe('https://new.com');
    });

    it('composite key: same name, different type → separate rows', () => {
        service.setLink('Фізика', 'Лекція', 'https://lec.com');
        service.setLink('Фізика', 'Практика', 'https://prac.com');
        expect(service.getLink('Фізика', 'Лекція')).toBe('https://lec.com');
        expect(service.getLink('Фізика', 'Практика')).toBe('https://prac.com');
    });

    // ── getLink ───────────────────────────────────────────────────────────────

    it('returns null for a non-existent entry', () => {
        expect(service.getLink('Невідомий', 'Лекція')).toBeNull();
    });

    it('is case-sensitive for lesson name', () => {
        service.setLink('Фізика', 'Лекція', 'https://a.com');
        expect(service.getLink('фізика', 'Лекція')).toBeNull();
    });

    // ── deleteLink ────────────────────────────────────────────────────────────

    it('returns true and removes the row', () => {
        service.setLink('Хімія', 'Лаба', 'https://chem.com');
        const deleted = service.deleteLink('Хімія', 'Лаба');
        expect(deleted).toBe(true);
        expect(service.getLink('Хімія', 'Лаба')).toBeNull();
    });

    it('returns false when the row does not exist', () => {
        expect(service.deleteLink('Phantom', 'Лекція')).toBe(false);
    });

    it('deletes only the matching composite key', () => {
        service.setLink('Фізика', 'Лекція', 'https://lec.com');
        service.setLink('Фізика', 'Лаба', 'https://lab.com');
        service.deleteLink('Фізика', 'Лекція');
        expect(service.getLink('Фізика', 'Лекція')).toBeNull();
        expect(service.getLink('Фізика', 'Лаба')).toBe('https://lab.com');
    });

    // ── getAllLinks ───────────────────────────────────────────────────────────

    it('returns empty array when table is empty', () => {
        expect(service.getAllLinks()).toHaveLength(0);
    });

    it('returns all inserted rows', () => {
        service.setLink('A', 'Лекція', 'https://a.com');
        service.setLink('B', 'Практика', 'https://b.com');
        const all = service.getAllLinks();
        expect(all).toHaveLength(2);
        expect(all.map((r) => r.lesson_name).sort()).toEqual(['A', 'B']);
    });
});
