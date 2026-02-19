import Database from 'better-sqlite3';
import { logger } from '../utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserNotification {
    user_id: number;
    enabled: 1 | 0;          // SQLite stores booleans as integers
    minutes_before: number;
}

// ─── Repository factory ───────────────────────────────────────────────────────
//
// The factory accepts an injected Database instance so unit tests can pass
// an in-memory DB without touching the real file.

export function createNotificationRepo(db: Database.Database) {
    // Ensure the table exists
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_notifications (
            user_id       INTEGER PRIMARY KEY,
            enabled       INTEGER NOT NULL DEFAULT 1,
            minutes_before INTEGER NOT NULL DEFAULT 10
        )
    `);

    return {
        /**
         * Returns the notification row for a user, or null if they have
         * never used /enable.
         */
        get(userId: number): UserNotification | null {
            const row = db.prepare(
                'SELECT user_id, enabled, minutes_before FROM user_notifications WHERE user_id = ?',
            ).get(userId) as UserNotification | undefined;
            return row ?? null;
        },

        /**
         * Upserts notification settings for a user.
         */
        upsert(userId: number, enabled: boolean, minutesBefore: number): void {
            db.prepare(`
                INSERT INTO user_notifications (user_id, enabled, minutes_before)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    enabled        = excluded.enabled,
                    minutes_before = excluded.minutes_before
            `).run(userId, enabled ? 1 : 0, minutesBefore);
            logger.debug(`Notification upsert userId=${userId} enabled=${enabled} min=${minutesBefore}`);
        },

        /**
         * Returns all rows where enabled = 1.
         */
        getAllEnabled(): UserNotification[] {
            return db.prepare(
                'SELECT user_id, enabled, minutes_before FROM user_notifications WHERE enabled = 1',
            ).all() as UserNotification[];
        },
    };
}

export type NotificationRepo = ReturnType<typeof createNotificationRepo>;
