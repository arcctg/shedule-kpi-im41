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

function parseIdList(name: string): number[] {
    const raw = optionalEnv(name, '');
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => !Number.isNaN(n));
}

function parseUsernameList(name: string): string[] {
    const raw = optionalEnv(name, '');
    return raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
}

export const config = {
    bot: {
        token: requireEnv('BOT_TOKEN'),
        webhookUrl: optionalEnv('WEBHOOK_URL', ''),
        webhookSecret: optionalEnv('WEBHOOK_SECRET', ''),
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
    admin: {
        ids: parseIdList('ADMIN_IDS'),
        usernames: parseUsernameList('ADMIN_USERNAMES'),
    },
} as const;
