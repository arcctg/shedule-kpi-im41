import { type MiddlewareFn, type Context } from 'telegraf';

// ─── Service ─────────────────────────────────────────────────────────────────

export class ConcurrencyService {
    private readonly activeUsers = new Set<number>();

    /**
     * Tries to acquire a lock for the given userId.
     * Returns true on success (lock acquired), false if already locked.
     */
    tryAcquire(userId: number): boolean {
        if (this.activeUsers.has(userId)) {
            return false;
        }
        this.activeUsers.add(userId);
        return true;
    }

    release(userId: number): void {
        this.activeUsers.delete(userId);
    }
}

export const concurrencyService = new ConcurrencyService();

// ─── Telegraf middleware ──────────────────────────────────────────────────────

export function createConcurrencyMiddleware(): MiddlewareFn<Context> {
    return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
        const userId = ctx.from?.id;
        if (userId === undefined) {
            // Non-user updates — pass through without locking
            return next();
        }

        // Acquire BEFORE try so a failed acquire never enters the finally block
        if (!concurrencyService.tryAcquire(userId)) {
            // Silently ignore — duplicate in-flight request
            return;
        }

        try {
            await next();
        } finally {
            concurrencyService.release(userId);
        }
    };
}
