import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isAdmin } from '../../src/utils/admin.guard';
import type { Context } from 'telegraf';

// Mock config so tests don't rely on .env values
vi.mock('../../src/config', () => ({
    config: {
        admin: {
            ids: [111, 222],
            usernames: ['adminuser', 'superadmin'],
        },
    },
}));

function makeCtx(userId?: number, username?: string): Context {
    return {
        from: userId !== undefined
            ? { id: userId, is_bot: false, first_name: 'Test', username }
            : undefined,
    } as unknown as Context;
}

describe('isAdmin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns true when userId is in ADMIN_IDS', () => {
        expect(isAdmin(makeCtx(111))).toBe(true);
        expect(isAdmin(makeCtx(222))).toBe(true);
    });

    it('returns false when userId is not in ADMIN_IDS (no username)', () => {
        expect(isAdmin(makeCtx(999))).toBe(false);
    });

    it('returns true when username matches exactly (lowercase)', () => {
        expect(isAdmin(makeCtx(999, 'adminuser'))).toBe(true);
    });

    it('returns true when username matches case-insensitively', () => {
        expect(isAdmin(makeCtx(999, 'AdminUser'))).toBe(true);
        expect(isAdmin(makeCtx(999, 'ADMINUSER'))).toBe(true);
        expect(isAdmin(makeCtx(999, 'SuperAdmin'))).toBe(true);
    });

    it('returns false when username does not match', () => {
        expect(isAdmin(makeCtx(999, 'randomuser'))).toBe(false);
    });

    it('returns false when ctx.from is undefined', () => {
        expect(isAdmin(makeCtx(undefined))).toBe(false);
    });

    it('returns false when username is undefined and id does not match', () => {
        expect(isAdmin(makeCtx(333, undefined))).toBe(false);
    });

    it('ID check takes priority over username', () => {
        // User 111 is admin by ID even with no username
        expect(isAdmin(makeCtx(111, undefined))).toBe(true);
    });
});
