import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConcurrencyService, createConcurrencyMiddleware } from '../../src/services/concurrency.service';
import { createMockContext } from '../helpers/mockCtx';

describe('ConcurrencyService', () => {
    let service: ConcurrencyService;

    beforeEach(() => {
        service = new ConcurrencyService();
    });

    it('acquires lock for a new user', () => {
        expect(service.tryAcquire(1)).toBe(true);
    });

    it('returns false when lock is already held', () => {
        service.tryAcquire(1);
        expect(service.tryAcquire(1)).toBe(false);
    });

    it('allows re-acquire after release', () => {
        service.tryAcquire(1);
        service.release(1);
        expect(service.tryAcquire(1)).toBe(true);
    });

    it('does not affect other users', () => {
        service.tryAcquire(1);
        expect(service.tryAcquire(2)).toBe(true);
    });

    it('release of non-existent user is a no-op', () => {
        expect(() => service.release(999)).not.toThrow();
    });
});

describe('createConcurrencyMiddleware', () => {
    it('passes through when from is undefined', async () => {
        const middleware = createConcurrencyMiddleware();
        const next = vi.fn().mockResolvedValue(undefined);
        const ctx = createMockContext({ userId: 1 });
        (ctx as unknown as Record<string, unknown>)['from'] = undefined;

        await middleware(ctx, next);
        expect(next).toHaveBeenCalled();
    });

    it('calls next() and releases lock after completion', async () => {
        const middleware = createConcurrencyMiddleware();
        const next = vi.fn().mockResolvedValue(undefined);
        const ctx = createMockContext({ userId: 42 });

        await middleware(ctx, next);
        expect(next).toHaveBeenCalledTimes(1);

        // Lock should be released — second call should also go through
        await middleware(ctx, next);
        expect(next).toHaveBeenCalledTimes(2);
    });

    it('drops duplicate in-flight request silently', async () => {
        const middleware = createConcurrencyMiddleware();
        const ctx = createMockContext({ userId: 300 });

        let resolveFirst!: () => void;
        const firstNext = vi.fn().mockImplementation(
            () => new Promise<void>((res) => { resolveFirst = res; }),
        );

        // Start first call — it will hang
        const firstCall = middleware(ctx, firstNext);

        // Second call while first is still running — should be dropped
        const secondNext = vi.fn().mockResolvedValue(undefined);
        await middleware(ctx, secondNext);

        // Second next should NOT have been called (dropped)
        expect(secondNext).not.toHaveBeenCalled();

        // Resolve the first and clean up
        resolveFirst();
        await firstCall;
    });

    it('releases lock even when next() throws', async () => {
        const middleware = createConcurrencyMiddleware();
        const ctx = createMockContext({ userId: 55 });
        const throwingNext = vi.fn().mockRejectedValue(new Error('boom'));

        await expect(middleware(ctx, throwingNext)).rejects.toThrow('boom');

        // After the error the lock must be released — next call should succeed
        const next2 = vi.fn().mockResolvedValue(undefined);
        await middleware(ctx, next2);
        expect(next2).toHaveBeenCalled();
    });
});
