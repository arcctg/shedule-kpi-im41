import { type Context } from 'telegraf';
import { config } from '../config';

/**
 * Returns true when the message sender is an administrator.
 *
 * An admin is identified either by their numeric Telegram user ID (ADMIN_IDS)
 * or by their @username, case-insensitively (ADMIN_USERNAMES).
 *
 * If ctx.from is undefined (e.g. channel posts) the function returns false.
 */
export function isAdmin(ctx: Context): boolean {
    const from = ctx.from;
    if (!from) {
        return false;
    }

    if (config.admin.ids.includes(from.id)) {
        return true;
    }

    const username = from.username?.toLowerCase() ?? '';
    if (username && config.admin.usernames.includes(username)) {
        return true;
    }

    return false;
}
