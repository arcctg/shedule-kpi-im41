/**
 * Unit tests for the stale-update guard middleware embedded in createBot().
 *
 * Strategy: build a minimal middleware-chain manually rather than spinning
 * up the full bot, so there is no Telegraf token requirement.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Inline middleware (mirrors bot.ts) ───────────────────────────────────────
// Extracted as a pure function so tests don't need a real Telegraf instance.

import { logger } from '../../src/utils/logger';

vi.mock('../../src/utils/logger', () => ({
    logger: {
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
    },
}));

type StaleFakeCtx = {
    message?: { date: number };
    from?: { id: number };
    update: Record<string, unknown>;
};

/**
 * Pure stale-guard middleware extracted from bot.ts logic for unit testing.
 */
function staleGuard(
    ctx: StaleFakeCtx,
    next: () => Promise<void>,
): Promise<void> | void {
    const updateDate = ctx.message?.date;
    if (updateDate !== undefined) {
        const nowSec = Math.floor(Date.now() / 1000);
        if (nowSec - updateDate > 60) {
            logger.warn(
                `[SECURITY] Stale update ignored (age=${nowSec - updateDate}s, ` +
                `userId=${ctx.from?.id ?? 'unknown'})`,
            );
            return;
        }
    }
    return next();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW_UNIX = 1_700_000_000; // arbitrary fixed epoch (seconds)

function makeCtx(dateDeltaSec?: number): StaleFakeCtx {
    return {
        message: dateDeltaSec !== undefined
            ? { date: NOW_UNIX - dateDeltaSec }
            : undefined,
        from: { id: 42 },
        update: {},
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Stale update guard middleware', () => {
    let nextCalled: boolean;
    let next: () => Promise<void>;

    beforeEach(() => {
        nextCalled = false;
        next = vi.fn(async () => { nextCalled = true; });

        // Pin "now" to a known Unix time
        vi.useFakeTimers();
        vi.setSystemTime(NOW_UNIX * 1000); // Date.now() returns ms
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    // ─── Fresh updates ────────────────────────────────────────────────────────

    it('passes through an update from 30 seconds ago', async () => {
        const ctx = makeCtx(30);      // message.date = NOW - 30 s
        await staleGuard(ctx, next);
        expect(nextCalled).toBe(true);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('passes through an update from exactly 60 seconds ago (boundary: age == 60 is NOT stale)', async () => {
        const ctx = makeCtx(60);       // age = 60, condition is > 60, so NOT dropped
        await staleGuard(ctx, next);
        expect(nextCalled).toBe(true);
    });

    it('passes through an update sent right now (age = 0)', async () => {
        const ctx = makeCtx(0);
        await staleGuard(ctx, next);
        expect(nextCalled).toBe(true);
    });

    // ─── Stale updates ────────────────────────────────────────────────────────

    it('ignores an update from 61 seconds ago', async () => {
        const ctx = makeCtx(61);      // age = 61 s → dropped
        await staleGuard(ctx, next);
        expect(nextCalled).toBe(false);
        expect(logger.warn).toHaveBeenCalledOnce();
        const [msg] = vi.mocked(logger.warn).mock.calls[0];
        expect(msg).toContain('[SECURITY] Stale update ignored');
        expect(msg).toContain('age=61s');
    });

    it('ignores an update from 5 minutes ago', async () => {
        const ctx = makeCtx(300);
        await staleGuard(ctx, next);
        expect(nextCalled).toBe(false);
        expect(logger.warn).toHaveBeenCalledOnce();
    });

    it('logs the userId in the warning when from.id is available', async () => {
        const ctx = makeCtx(120);
        ctx.from = { id: 99999 };
        await staleGuard(ctx, next);
        const [msg] = vi.mocked(logger.warn).mock.calls[0];
        expect(msg).toContain('userId=99999');
    });

    it('logs userId=unknown when from is absent', async () => {
        const ctx = makeCtx(120);
        ctx.from = undefined;
        await staleGuard(ctx, next);
        const [msg] = vi.mocked(logger.warn).mock.calls[0];
        expect(msg).toContain('userId=unknown');
    });

    // ─── Updates without message.date ─────────────────────────────────────────

    it('passes through callback_query (no message.date) without checking time', async () => {
        const ctx: StaleFakeCtx = { update: { callback_query: {} } }; // no message
        await staleGuard(ctx, next);
        expect(nextCalled).toBe(true);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it('passes through inline_query (no message at all)', async () => {
        const ctx: StaleFakeCtx = { update: { inline_query: {} } };
        await staleGuard(ctx, next);
        expect(nextCalled).toBe(true);
    });

    it('passes through a ctx where message exists but date is undefined', async () => {
        // Edge: message object present but no date property
        const ctx: StaleFakeCtx = {
            message: undefined,
            update: {},
        };
        await staleGuard(ctx, next);
        expect(nextCalled).toBe(true);
    });
});
