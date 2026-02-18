import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function optionalEnv(name: string, defaultValue: string): string {
    return process.env[name] ?? defaultValue;
}

export const config = {
    bot: {
        token: requireEnv('BOT_TOKEN'),
        webhookUrl: optionalEnv('WEBHOOK_URL', ''),
    },
    server: {
        port: parseInt(optionalEnv('PORT', '3000'), 10),
    },
    kpi: {
        groupId: optionalEnv('GROUP_ID', '4318'),
        apiBase: 'https://api.campus.kpi.ua/schedule',
    },
    cache: {
        ttl: parseInt(optionalEnv('CACHE_TTL', '300'), 10),
    },
    database: {
        path: optionalEnv('DB_PATH', './data/links.db'),
    },
    log: {
        level: optionalEnv('LOG_LEVEL', 'info'),
    },
} as const;
