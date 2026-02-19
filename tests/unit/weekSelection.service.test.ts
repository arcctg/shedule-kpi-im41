import { describe, it, expect, beforeEach } from 'vitest';
import { WeekSelectionService } from '../../src/services/weekSelection.service';

describe('WeekSelectionService', () => {
    let service: WeekSelectionService;

    beforeEach(() => {
        service = new WeekSelectionService();
    });

    it('returns null when no selection has been made', () => {
        expect(service.getSelectedWeek(1)).toBeNull();
    });

    it('stores and retrieves week 1', () => {
        service.setSelectedWeek(100, 1);
        expect(service.getSelectedWeek(100)).toBe(1);
    });

    it('stores and retrieves week 2', () => {
        service.setSelectedWeek(200, 2);
        expect(service.getSelectedWeek(200)).toBe(2);
    });

    it('overrides existing selection', () => {
        service.setSelectedWeek(1, 1);
        service.setSelectedWeek(1, 2);
        expect(service.getSelectedWeek(1)).toBe(2);
    });

    it('clears selection', () => {
        service.setSelectedWeek(1, 1);
        service.clearSelection(1);
        expect(service.getSelectedWeek(1)).toBeNull();
    });

    it('clearing non-existent selection is a no-op', () => {
        expect(() => service.clearSelection(999)).not.toThrow();
    });

    it('tracks multiple chat IDs independently', () => {
        service.setSelectedWeek(1, 1);
        service.setSelectedWeek(2, 2);
        expect(service.getSelectedWeek(1)).toBe(1);
        expect(service.getSelectedWeek(2)).toBe(2);
    });
});
