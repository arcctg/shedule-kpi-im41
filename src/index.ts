import express from 'express';
import { createBot } from './bot';
import { config } from './config';
import { logger } from './utils/logger';
import { createWebhookRouter } from './routes/webhook';
import { dbService, rawDb } from './database/db';
import { createNotificationRepo } from './database/notificationRepo';
import { createReminderService } from './services/reminder.service';

async function main(): Promise<void> {
    const notificationRepo = createNotificationRepo(rawDb);

    const bot = createBot({ notificationRepo });
    const reminderService = createReminderService(bot, notificationRepo);

    // Start the every-minute cron + midnight reset cron
    reminderService.start();

    // Register command hints (shown in Telegram's "/" menu)
    await bot.telegram.setMyCommands([
        { command: 'today', description: 'Розклад на сьогодні' },
        { command: 'tomorrow', description: 'Розклад на завтра' },
        { command: 'week', description: 'Розклад на весь тиждень' },
        { command: 'fortnight', description: 'Переглянути та перемикати тижні' },
        { command: 'now', description: 'Поточна пара' },
        { command: 'left', description: 'Скільки хвилин до кінця пари' },
        { command: 'setlink', description: 'Зберегти посилання: "Назва" Тип https://...' },
        { command: 'deletelink', description: 'Видалити посилання: "Назва" Тип' },
        { command: 'enable', description: 'Увімкнути/вимкнути нагадування (/enable [хв])' },
        { command: 'teacher', description: 'Викладачі предмета: "Назва" [Тип]' },

    ]);
    logger.info('Bot commands registered');

    const app = express();
    app.use(express.json());

    // Mount webhook routes
    const webhookRouter = createWebhookRouter(bot, config.bot.webhookSecret);
    app.use('/', webhookRouter);

    const useWebhook = Boolean(config.bot.webhookUrl);

    if (useWebhook) {
        // ── Webhook mode ──────────────────────────────────────────────────────────
        const webhookPath = '/webhook';
        const fullWebhookUrl = `${config.bot.webhookUrl}${webhookPath}`;
        const hasSecret = Boolean(config.bot.webhookSecret);

        logger.info(`[WEBHOOK] Mode: webhook`);
        logger.info(`[WEBHOOK] URL: ${fullWebhookUrl}`);
        logger.info(`[WEBHOOK] Secret: ${hasSecret ? 'configured' : 'not configured'}`);

        // ── Re-registration guard ──────────────────────────────────────────────
        // Fetch current webhook state from Telegram so we only call setWebhook
        // when strictly necessary (changed URL or secret presence changed).
        let needsRegistration = true;
        try {
            const info = await bot.telegram.getWebhookInfo();
            const urlSame = info.url === fullWebhookUrl;
            // Telegram reports whether a secret token is set via `has_custom_certificate`
            // but NOT the token value itself. We compare "secret present" flag instead.
            const secretSame = Boolean(info.has_custom_certificate) === hasSecret;
            if (urlSame && secretSame) {
                needsRegistration = false;
                logger.info('[WEBHOOK] Already registered correctly — skipping setWebhook');
            } else {
                logger.info(
                    `[WEBHOOK] Re-registering (urlChanged=${!urlSame}, secretChanged=${!secretSame})`,
                );
            }
        } catch (err) {
            logger.warn('[WEBHOOK] Could not fetch webhook info — will re-register:', err);
        }

        if (needsRegistration) {
            const setWebhookOptions = hasSecret
                ? { secret_token: config.bot.webhookSecret, drop_pending_updates: true }
                : { drop_pending_updates: true };
            await bot.telegram.setWebhook(fullWebhookUrl, setWebhookOptions);
            logger.info(
                hasSecret
                    ? '[WEBHOOK] Set with secret'
                    : '[WEBHOOK] Set without secret',
            );
        }

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
