const MAX_LENGTH = 3800;

/**
 * Splits a week schedule message into chunks that fit within Telegram's
 * message length limit. Splits only on day boundaries — never mid-day.
 *
 * Days are separated by a line containing only "⬜⬜⬜" (the day header prefix).
 */
export function splitWeekMessageByDay(message: string): string[] {
    if (message.length <= MAX_LENGTH) {
        return [message];
    }

    // Split into day blocks. The header line starts with "⬜⬜⬜".
    // We keep the delimiter attached to the start of each day block.
    const dayBlocks = message.split(/(?=⬜⬜⬜)/);

    const chunks: string[] = [];
    let current = '';

    for (const block of dayBlocks) {
        if (!block.trim()) continue;

        if (current.length + block.length > MAX_LENGTH && current.length > 0) {
            chunks.push(current.trimEnd());
            current = block;
        } else {
            current += block;
        }
    }

    if (current.trim()) {
        chunks.push(current.trimEnd());
    }

    return chunks;
}
