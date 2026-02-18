/**
 * Stores per-chat week selection (1 or 2).
 * Falls back to auto-detection if no selection has been made.
 */
export class WeekSelectionService {
    private readonly selections = new Map<number, 1 | 2>();

    getSelectedWeek(chatId: number): 1 | 2 | null {
        return this.selections.get(chatId) ?? null;
    }

    setSelectedWeek(chatId: number, week: 1 | 2): void {
        this.selections.set(chatId, week);
    }

    clearSelection(chatId: number): void {
        this.selections.delete(chatId);
    }
}

export const weekSelectionService = new WeekSelectionService();
