import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createWebhookRouter } from '../../src/routes/webhook';
import type { Telegraf } from 'telegraf';

// Minimal Telegraf stub — we don't need a real bot token for route testing
function createMockBot(): Telegraf {
    return {
        handleUpdate: vi.fn().mockImplementation((_body, res: express.Response) => {
            res.sendStatus(200);
            return Promise.resolve();
        }),
    } as unknown as Telegraf;
}

function createApp(secret = ''): express.Express {
    const app = express();
    app.use(express.json());
    app.use('/', createWebhookRouter(createMockBot(), secret));
    return app;
}

describe('Webhook router — no secret configured', () => {
    const app = createApp('');

    it('POST /webhook returns 200 when no secret is required', async () => {
        const res = await request(app)
            .post('/webhook')
            .send({ update_id: 1 });
        expect(res.status).toBe(200);
    });

    it('GET /health returns 200 with status ok', async () => {
        const res = await request(app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ status: 'ok' });
    });
});

describe('Webhook router — with secret configured', () => {
    const SECRET = 'my-super-secret';
    const app = createApp(SECRET);

    it('returns 403 when X-Telegram-Bot-Api-Secret-Token header is absent', async () => {
        const res = await request(app)
            .post('/webhook')
            .send({ update_id: 1 });
        expect(res.status).toBe(403);
    });

    it('returns 403 when header has a wrong value', async () => {
        const res = await request(app)
            .post('/webhook')
            .set('X-Telegram-Bot-Api-Secret-Token', 'wrong-secret')
            .send({ update_id: 1 });
        expect(res.status).toBe(403);
    });

    it('returns 200 when header matches the secret', async () => {
        const res = await request(app)
            .post('/webhook')
            .set('X-Telegram-Bot-Api-Secret-Token', SECRET)
            .send({ update_id: 1 });
        expect(res.status).toBe(200);
    });
});
