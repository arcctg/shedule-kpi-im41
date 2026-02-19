/**
 * Creates a fresh in-memory better-sqlite3 database instance with the
 * lesson_links schema applied. Use this in unit tests instead of the
 * real file-based DB so tests remain isolated and fast.
 */
import Database from 'better-sqlite3';

export function createTestDatabase(): Database.Database {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS lesson_links (
            lesson_name TEXT NOT NULL,
            lesson_type TEXT NOT NULL,
            link        TEXT NOT NULL,
            PRIMARY KEY (lesson_name, lesson_type)
        )
    `);

    return db;
}
