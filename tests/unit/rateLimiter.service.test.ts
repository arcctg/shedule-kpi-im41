import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RateLimiterService, createRateLimiterMiddleware } from '../../src/services/rateLimiter.service';
import { createMockContext } from '../helpers/mockCtx';

// We test the class directly (not the exported singleton) so each test
// gets a clean instance without bleeding state across tests.

describe('RateLimiterService', () => {
    let service: RateLimiterService;

    beforeEach(() => {
        service = new RateLimiterService();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('allows first request', () => {
        expect(service.check(1)).toBe(true);
    });

    it('allows up to MAX_REQUESTS (5) within window', () => {
        for (let i = 0; i < 5; i++) {
            expect(service.check(1)).toBe(true);
        }
    });

    it('blocks on the 6th request within window', () => {
        for (let i = 0; i < 5; i++) service.check(1);
        expect(service.check(1)).toBe(false);
    });

    it('keeps user blocked during block period (30 s)', () => {
        for (let i = 0; i < 6; i++) service.check(1);
        vi.advanceTimersByTime(15_000); // 15 s into the 30 s block
        expect(service.check(1)).toBe(false);
    });

    it('unblocks after 30 s have passed', () => {
        for (let i = 0; i < 6; i++) service.check(1);
        vi.advanceTimersByTime(31_000); // past block period
        expect(service.check(1)).toBe(true);
    });

    it('resets the window after 10 s', () => {
        for (let i = 0; i < 5; i++) service.check(1);
        vi.advanceTimersByTime(11_000); // past 10 s window
        expect(service.check(1)).toBe(true);
    });

    it('tracks different users independently', () => {
        for (let i = 0; i < 6; i++) service.check(1); // user 1 is blocked
        expect(service.check(2)).toBe(true); // user 2 is not affected
    });
});

describe('createRateLimiterMiddleware', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('passes through update when from is undefined', async () => {
        const middleware = createRateLimiterMiddleware();
        const next = vi.fn().mockResolvedValue(undefined);
        const ctx = createMockContext({ userId: 1 });
        (ctx as unknown as Record<string, unknown>)['from'] = undefined;

        await middleware(ctx, next);
        expect(next).toHaveBeenCalled();
    });

    it('calls next for allowed requests', async () => {
        const middleware = createRateLimiterMiddleware();
        const next = vi.fn().mockResolvedValue(undefined);
        const ctx = createMockContext({ userId: 5001 });

        await middleware(ctx, next);
        expect(next).toHaveBeenCalled();
        expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('replies with rate-limit message after 6 requests within window', async () => {
        const middleware = createRateLimiterMiddleware();
        const next = vi.fn().mockResolvedValue(undefined);
        const ctx = createMockContext({ userId: 5002 });

        for (let i = 0; i < 6; i++) {
            await middleware(ctx, next);
        }

        const replyCalls = (ctx.reply as ReturnType<typeof vi.fn>).mock.calls;
        const hasRateMsg = replyCalls.some(
            (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('Забагато'),
        );
        expect(hasRateMsg).toBe(true);
    });
});
