import { vi } from 'vitest';
import type { Context } from 'telegraf';

/**
 * Creates a minimal mock of a Telegraf Context for use in unit tests.
 * Only the fields actually referenced by our middleware / guards are populated.
 */
export function createMockContext(options: {
    userId?: number;
    username?: string;
    messageText?: string;
} = {}): Context {
    const { userId = 100, username, messageText = '' } = options;

    const reply = vi.fn().mockResolvedValue(undefined);
    const replyWithHTML = vi.fn().mockResolvedValue(undefined);

    const ctx = {
        from: userId !== undefined
            ? { id: userId, is_bot: false, first_name: 'Test', username }
            : undefined,
        message: {
            message_id: 1,
            date: Date.now(),
            chat: { id: userId, type: 'private' },
            from: { id: userId, is_bot: false, first_name: 'Test', username },
            text: messageText,
        },
        update: { update_id: 1 },
        reply,
        replyWithHTML,
        answerCbQuery: vi.fn().mockResolvedValue(undefined),
        editMessageText: vi.fn().mockResolvedValue(undefined),
    } as unknown as Context;

    return ctx;
}
