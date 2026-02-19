/**
 * Unit tests for the webhook secret verification logic in
 * src/routes/webhook.ts — createWebhookRouter().
 *
 * Strategy:
 *  - pass a minimal bot stub (no Telegraf constructor needed)
 *  - extract the POST handler from the router layer and call it directly
 *  - use a spy on res.sendStatus / res.json to assert behaviour
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebhookRouter } from '../../src/routes/webhook';
import type { Telegraf } from 'telegraf';
import type { Request, Response } from 'express';

// ─── Mock logger ──────────────────────────────────────────────────────────────

vi.mock('../../src/utils/logger', () => ({
    logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));
import { logger } from '../../src/utils/logger';

// ─── Minimal bot stub ─────────────────────────────────────────────────────────

function makeBot() {
    return {
        handleUpdate: vi.fn().mockResolvedValue(undefined),
    } as unknown as Telegraf;
}

// ─── Minimal req/res stubs ────────────────────────────────────────────────────

function makeReq(
    headers: Record<string, string | undefined> = {},
    ip = '127.0.0.1',
): Request {
    return { body: { update_id: 1 }, headers, ip } as unknown as Request;
}

function makeRes() {
    let _statusCode: number | null = null;
    let _ended = false;
    const res: Partial<Response> & { _statusCode: number | null; _ended: boolean } = {
        get _statusCode() { return _statusCode; },
        get _ended() { return _ended; },
        sendStatus: vi.fn((code: number) => {
            _statusCode = code;
            _ended = true;
            return res as Response;
        }),
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
    };
    return res;
}

// ─── Router layer extraction ──────────────────────────────────────────────────

type Layer = {
    route?: {
        path: string;
        stack: Array<{ method: string; handle: (req: Request, res: Response, next: () => void) => void | Promise<void> }>;
    };
};

function getHandler(router: ReturnType<typeof createWebhookRouter>, path: string, method: string) {
    const stack = (router as unknown as { stack: Layer[] }).stack;
    const layer = stack.find((l) => l.route?.path === path);
    const h = layer?.route?.stack.find((s) => s.method === method)?.handle;
    if (!h) throw new Error(`${method.toUpperCase()} ${path} handler not found`);
    return h;
}

/**
 * Invoke the POST /webhook handler.
 * The handler either calls res.sendStatus (sync rejection) and returns, or
 * calls bot.handleUpdate() and awaits it. We await the returned promise (or
 * undefined) to ensure all async work completes before asserting.
 */
async function callPostWebhook(
    bot: Telegraf,
    secret: string,
    req: Request,
    res: ReturnType<typeof makeRes>,
): Promise<void> {
    const router = createWebhookRouter(bot, secret);
    const handler = getHandler(router, '/webhook', 'post');
    const result = handler(req, res as unknown as Response, () => { });
    if (result && typeof (result as Promise<void>).then === 'function') {
        await result;
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Webhook secret verification', () => {
    beforeEach(() => vi.clearAllMocks());

    // ─── No secret ───────────────────────────────────────────────────────────

    describe('when secret is empty (not configured)', () => {
        it('passes requests with no secret header — check skipped', async () => {
            const bot = makeBot();
            const req = makeReq({});
            const res = makeRes();
            await callPostWebhook(bot, '', req, res);

            expect(res._ended).toBe(false);
            expect(logger.warn).not.toHaveBeenCalled();
            expect(bot.handleUpdate).toHaveBeenCalledOnce();
        });

        it('passes requests that include an arbitrary token (header is ignored)', async () => {
            const bot = makeBot();
            const req = makeReq({ 'x-telegram-bot-api-secret-token': 'irrelevant' });
            const res = makeRes();
            await callPostWebhook(bot, '', req, res);

            expect(res._ended).toBe(false);
            expect(bot.handleUpdate).toHaveBeenCalledOnce();
        });
    });

    // ─── Secret configured ────────────────────────────────────────────────────

    describe('when secret is configured', () => {
        const SECRET = 'my-super-secret-token';

        it('accepts request with correct matching header → processes update', async () => {
            const bot = makeBot();
            const req = makeReq({ 'x-telegram-bot-api-secret-token': SECRET });
            const res = makeRes();
            await callPostWebhook(bot, SECRET, req, res);

            expect(res._ended).toBe(false);
            expect(logger.warn).not.toHaveBeenCalled();
            expect(bot.handleUpdate).toHaveBeenCalledOnce();
        });

        it('rejects request with wrong header → 403, update not processed', async () => {
            const bot = makeBot();
            const req = makeReq({ 'x-telegram-bot-api-secret-token': 'wrong' });
            const res = makeRes();
            await callPostWebhook(bot, SECRET, req, res);

            expect(res.sendStatus).toHaveBeenCalledWith(403);
            expect(bot.handleUpdate).not.toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledOnce();
            const [msg] = vi.mocked(logger.warn).mock.calls[0];
            expect(String(msg)).toContain('[SECURITY]');
        });

        it('rejects request with missing header → 403', async () => {
            const bot = makeBot();
            const req = makeReq({});
            const res = makeRes();
            await callPostWebhook(bot, SECRET, req, res);

            expect(res.sendStatus).toHaveBeenCalledWith(403);
            expect(bot.handleUpdate).not.toHaveBeenCalled();
        });

        it('rejects request with empty string header → 403', async () => {
            const bot = makeBot();
            const req = makeReq({ 'x-telegram-bot-api-secret-token': '' });
            const res = makeRes();
            await callPostWebhook(bot, SECRET, req, res);

            expect(res.sendStatus).toHaveBeenCalledWith(403);
        });

        it('logs the client IP address in the security warning', async () => {
            const bot = makeBot();
            const req = makeReq({ 'x-telegram-bot-api-secret-token': 'bad' }, '10.0.0.99');
            const res = makeRes();
            await callPostWebhook(bot, SECRET, req, res);

            const [msg] = vi.mocked(logger.warn).mock.calls[0];
            expect(String(msg)).toContain('10.0.0.99');
        });
    });

    // ─── GET /health ──────────────────────────────────────────────────────────

    describe('GET /health', () => {
        it('returns { status: ok } regardless of secret configuration', () => {
            const bot = makeBot();
            const router = createWebhookRouter(bot, 'any-secret');
            const handler = getHandler(router, '/health', 'get');

            const jsonMock = vi.fn();
            handler({} as Request, { json: jsonMock } as unknown as Response, () => { });

            expect(jsonMock).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'ok' }),
            );
        });
    });
});
