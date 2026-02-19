import { type MiddlewareFn, type Context } from 'telegraf';
import { logger } from '../utils/logger';

// ─── Config ──────────────────────────────────────────────────────────────────

const WINDOW_MS = 10_000;  // 10 s sliding window
const MAX_REQUESTS = 5;    // max commands per window
const BLOCK_MS = 30_000;   // block duration after limit exceeded

// ─── State ───────────────────────────────────────────────────────────────────

interface UserState {
    count: number;
    firstRequest: number;
    blockedUntil?: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class RateLimiterService {
    private readonly store = new Map<number, UserState>();

    /**
     * Returns true when the request is allowed.
     * Returns false when the user is rate-limited or still blocked.
     */
    check(userId: number): boolean {
        const now = Date.now();
        const state = this.store.get(userId);

        // ── Still in block period ──────────────────────────────────────────
        if (state?.blockedUntil !== undefined && now < state.blockedUntil) {
            return false;
        }

        // ── Window expired or first request — reset ────────────────────────
        if (!state || now - state.firstRequest >= WINDOW_MS) {
            this.store.set(userId, { count: 1, firstRequest: now });
            return true;
        }

        // ── Within window ─────────────────────────────────────────────────
        state.count += 1;

        if (state.count > MAX_REQUESTS) {
            state.blockedUntil = now + BLOCK_MS;
            logger.warn(
                `[RATE_LIMIT] userId=${userId} exceeded ${MAX_REQUESTS} requests in ${WINDOW_MS / 1000}s — blocked for ${BLOCK_MS / 1000}s`,
            );
            return false;
        }

        return true;
    }
}

export const rateLimiterService = new RateLimiterService();

// ─── Telegraf middleware ──────────────────────────────────────────────────────

export function createRateLimiterMiddleware(): MiddlewareFn<Context> {
    return async (ctx: Context, next: () => Promise<void>): Promise<void> => {
        const userId = ctx.from?.id;
        if (userId === undefined) {
            // Non-user updates (channel posts, etc.) — pass through
            return next();
        }

        if (!rateLimiterService.check(userId)) {
            await ctx.reply('Забагато запитів. Спробуйте пізніше.');
            return;
        }

        return next();
    };
}
