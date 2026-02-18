import express from 'express';
import { createBot } from './bot';
import { config } from './config';
import { logger } from './utils/logger';
import { createWebhookRouter } from './routes/webhook';
import { dbService } from './database/db';

async function main(): Promise<void> {
    const bot = createBot();

    // Register command hints (shown in Telegram's "/" menu)
    await bot.telegram.setMyCommands([
        { command: 'today', description: 'Розклад на сьогодні' },
        { command: 'tomorrow', description: 'Розклад на завтра' },
        { command: 'week', description: 'Розклад на весь тиждень' },
        { command: 'fortnight', description: 'Переглянути та перемикати тижні' },
        { command: 'setlink', description: 'Зберегти посилання: "Назва" Тип https://...' },
        { command: 'deletelink', description: 'Видалити посилання: "Назва" Тип' },
    ]);
    logger.info('Bot commands registered');

    const app = express();

    app.use(express.json());

    // Mount webhook routes
    const webhookRouter = createWebhookRouter(bot);
    app.use('/', webhookRouter);

    const useWebhook = Boolean(config.bot.webhookUrl);

    if (useWebhook) {
        // ── Webhook mode ──────────────────────────────────────────────────────────
        const webhookPath = '/webhook';
        const fullWebhookUrl = `${config.bot.webhookUrl}${webhookPath}`;

        await bot.telegram.setWebhook(fullWebhookUrl);
        logger.info(`Webhook set to: ${fullWebhookUrl}`);

        const server = app.listen(config.server.port, () => {
            logger.info(`Express server listening on port ${config.server.port}`);
        });

        // ── Graceful shutdown ─────────────────────────────────────────────────────
        const shutdown = async (signal: string): Promise<void> => {
            logger.info(`Received ${signal}, shutting down gracefully...`);
            server.close(() => {
                logger.info('HTTP server closed');
            });
            await bot.telegram.deleteWebhook();
            dbService.close();
            process.exit(0);
        };

        process.once('SIGINT', () => void shutdown('SIGINT'));
        process.once('SIGTERM', () => void shutdown('SIGTERM'));
    } else {
        // ── Polling mode ──────────────────────────────────────────────────────────
        logger.info('WEBHOOK_URL not set — starting in polling mode');

        // Still start express for health checks
        const server = app.listen(config.server.port, () => {
            logger.info(`Express server listening on port ${config.server.port} (health check only)`);
        });

        await bot.launch();
        logger.info('Bot started in polling mode');

        // ── Graceful shutdown ─────────────────────────────────────────────────────
        const shutdown = (signal: string): void => {
            logger.info(`Received ${signal}, shutting down gracefully...`);
            bot.stop(signal);
            server.close(() => {
                logger.info('HTTP server closed');
            });
            dbService.close();
            process.exit(0);
        };

        process.once('SIGINT', () => shutdown('SIGINT'));
        process.once('SIGTERM', () => shutdown('SIGTERM'));
    }
}

main().catch((err) => {
    logger.error('Fatal error during startup:', err);
    process.exit(1);
});
