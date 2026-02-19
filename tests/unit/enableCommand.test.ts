/**
 * Unit tests for the /enable command argument parsing logic.
 * Tests the regex + validation that replaced the old string-split approach.
 */
import { describe, it, expect } from 'vitest';

// ─── Pure parsing helper (mirrors bot.ts logic exactly) ───────────────────────

const ENABLE_REGEX = /^\/enable(@\w+)?(?:\s+(\S+))?$/;
const VALIDATION_ERROR = 'Вкажіть кількість хвилин від 1 до 60.';

type ParseResult =
    | { valid: true; minutes: number | undefined }
    | { valid: false; error: string };

function parseEnableCommand(text: string): ParseResult {
    const match = ENABLE_REGEX.exec(text.trim());
    if (!match) return { valid: false, error: VALIDATION_ERROR };

    const rawArg = match[2]; // captured token (undefined if no argument)

    // No argument → toggle (always valid)
    if (rawArg === undefined) return { valid: true, minutes: undefined };

    const minutes = Number(rawArg);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
        return { valid: false, error: VALIDATION_ERROR };
    }
    return { valid: true, minutes };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/enable argument parsing', () => {

    // ─── Valid inputs ─────────────────────────────────────────────────────────

    it('/enable 5 → valid, minutes=5', () => {
        const r = parseEnableCommand('/enable 5');
        expect(r.valid).toBe(true);
        if (r.valid) expect(r.minutes).toBe(5);
    });

    it('/enable@botname 5 → valid, minutes=5 (group chat)', () => {
        const r = parseEnableCommand('/enable@im_41_shedule_kpi_bot 5');
        expect(r.valid).toBe(true);
        if (r.valid) expect(r.minutes).toBe(5);
    });

    it('/enable 60 → valid, minutes=60 (upper boundary)', () => {
        const r = parseEnableCommand('/enable 60');
        expect(r.valid).toBe(true);
        if (r.valid) expect(r.minutes).toBe(60);
    });

    it('/enable 1 → valid, minutes=1 (lower boundary)', () => {
        const r = parseEnableCommand('/enable 1');
        expect(r.valid).toBe(true);
        if (r.valid) expect(r.minutes).toBe(1);
    });

    it('/enable 30 → valid, minutes=30', () => {
        const r = parseEnableCommand('/enable 30');
        expect(r.valid).toBe(true);
        if (r.valid) expect(r.minutes).toBe(30);
    });

    it('/enable (no arg) → valid, toggle (minutes=undefined)', () => {
        const r = parseEnableCommand('/enable');
        expect(r.valid).toBe(true);
        if (r.valid) expect(r.minutes).toBeUndefined();
    });

    it('/enable@botname (no arg) → valid, toggle', () => {
        const r = parseEnableCommand('/enable@mybot');
        expect(r.valid).toBe(true);
        if (r.valid) expect(r.minutes).toBeUndefined();
    });

    // ─── Invalid inputs ───────────────────────────────────────────────────────

    it('/enable 0 → invalid (below minimum)', () => {
        const r = parseEnableCommand('/enable 0');
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toBe(VALIDATION_ERROR);
    });

    it('/enable 61 → invalid (above maximum)', () => {
        const r = parseEnableCommand('/enable 61');
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toBe(VALIDATION_ERROR);
    });

    it('/enable -5 → invalid (negative number)', () => {
        // -5 doesn't match \S+ after a space inside the regex group cleanly;
        // even if matched, Number('-5') = -5 < 1 → invalid
        const r = parseEnableCommand('/enable -5');
        expect(r.valid).toBe(false);
    });

    it('/enable abc → invalid (non-numeric)', () => {
        const r = parseEnableCommand('/enable abc');
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toBe(VALIDATION_ERROR);
    });

    it('/enable 5.5 → invalid (float)', () => {
        const r = parseEnableCommand('/enable 5.5');
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toBe(VALIDATION_ERROR);
    });

    it('/enable@botname 0 → invalid even with botname prefix', () => {
        const r = parseEnableCommand('/enable@mybot 0');
        expect(r.valid).toBe(false);
    });

    it('/enable@botname 61 → invalid even with botname prefix', () => {
        const r = parseEnableCommand('/enable@mybot 61');
        expect(r.valid).toBe(false);
    });

    it('/enable@botname abc → invalid, correct error message', () => {
        const r = parseEnableCommand('/enable@mybot abc');
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toBe(VALIDATION_ERROR);
    });

    // ─── Exact error message contract ─────────────────────────────────────────

    it('error message is exactly "Вкажіть кількість хвилин від 1 до 60."', () => {
        const r = parseEnableCommand('/enable 0');
        expect(r.valid).toBe(false);
        if (!r.valid) expect(r.error).toBe('Вкажіть кількість хвилин від 1 до 60.');
    });
});
