import { Router, type Request, type Response } from 'express';
import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';

export function createWebhookRouter(bot: Telegraf, secret: string): Router {
    const router = Router();

    // Telegram webhook endpoint
    router.post('/webhook', (req: Request, res: Response) => {
        // ── Webhook secret verification ─────────────────────────────────
        if (secret) {
            const header = req.headers['x-telegram-bot-api-secret-token'];
            if (header !== secret) {
                logger.warn(
                    `[SECURITY] Invalid webhook secret — expected token not matched. IP=${req.ip ?? 'unknown'}`,
                );
                res.sendStatus(403);
                return;
            }
        }

        bot.handleUpdate(req.body, res).catch((err) => {
            logger.error('Error handling webhook update:', err);
            if (!res.headersSent) {
                res.sendStatus(500);
            }
        });
    });

    // Health check
    router.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    return router;
}
