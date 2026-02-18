import { Router, Request, Response } from 'express';
import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';

export function createWebhookRouter(bot: Telegraf): Router {
    const router = Router();

    // Telegram webhook endpoint
    router.post('/webhook', (req: Request, res: Response) => {
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
