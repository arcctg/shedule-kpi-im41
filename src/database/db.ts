import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../utils/logger';
import type { LessonLink } from '../types/kpi.types';

function initDatabase(): Database.Database {
    const dbPath = config.database.path;
    const dbDir = path.dirname(dbPath);

    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        logger.info(`Created database directory: ${dbDir}`);
    }

    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Create new table with composite PK (lesson_name, lesson_type)
    db.exec(`
    CREATE TABLE IF NOT EXISTS lesson_links (
      lesson_name TEXT NOT NULL,
      lesson_type TEXT NOT NULL,
      link        TEXT NOT NULL,
      PRIMARY KEY (lesson_name, lesson_type)
    )
  `);

    // Migration: if old table exists with only lesson_name PK, migrate it
    try {
        const cols = db
            .prepare(`PRAGMA table_info(lesson_links)`)
            .all() as Array<{ name: string }>;
        const hasType = cols.some((c) => c.name === 'lesson_type');
        if (!hasType) {
            logger.info('Migrating lesson_links table to composite PK schema...');
            db.exec(`
        ALTER TABLE lesson_links RENAME TO lesson_links_old;
        CREATE TABLE lesson_links (
          lesson_name TEXT NOT NULL,
          lesson_type TEXT NOT NULL,
          link        TEXT NOT NULL,
          PRIMARY KEY (lesson_name, lesson_type)
        );
        INSERT INTO lesson_links (lesson_name, lesson_type, link)
          SELECT lesson_name, 'Лекція', link FROM lesson_links_old;
        DROP TABLE lesson_links_old;
      `);
            logger.info('Migration complete.');
        }
    } catch {
        // Table may not exist yet — that's fine, CREATE TABLE above handles it
    }

    logger.info(`Database initialized at: ${dbPath}`);
    return db;
}

const db = initDatabase();

export const dbService = {
    setLink(lessonName: string, lessonType: string, link: string): void {
        const stmt = db.prepare(`
      INSERT INTO lesson_links (lesson_name, lesson_type, link)
      VALUES (?, ?, ?)
      ON CONFLICT(lesson_name, lesson_type) DO UPDATE SET link = excluded.link
    `);
        stmt.run(lessonName, lessonType, link);
        logger.debug(`Set link for "${lessonName}" [${lessonType}]`);
    },

    deleteLink(lessonName: string, lessonType: string): boolean {
        const stmt = db.prepare(
            'DELETE FROM lesson_links WHERE lesson_name = ? AND lesson_type = ?',
        );
        const result = stmt.run(lessonName, lessonType);
        const deleted = result.changes > 0;
        logger.debug(`Delete link for "${lessonName}" [${lessonType}]: ${deleted}`);
        return deleted;
    },

    getLink(lessonName: string, lessonType: string): string | null {
        const stmt = db.prepare(
            'SELECT link FROM lesson_links WHERE lesson_name = ? AND lesson_type = ?',
        );
        const row = stmt.get(lessonName, lessonType) as Pick<LessonLink, 'link'> | undefined;
        return row?.link ?? null;
    },

    getAllLinks(): LessonLink[] {
        const stmt = db.prepare('SELECT lesson_name, lesson_type, link FROM lesson_links');
        return stmt.all() as LessonLink[];
    },

    close(): void {
        db.close();
        logger.info('Database connection closed');
    },
};
