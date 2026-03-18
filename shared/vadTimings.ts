/**
 * Shared VAD timing constants — single source of truth for the offset budget.
 * Used by both frontend (VadManager) and backend (InterruptionDetector).
 *
 * Total offset = redemption + debounce = time from actual speech stop
 * to system registering silence.
 */

/** Silero VAD redemption — bridges micro-pauses between syllables (frontend) */
export const VAD_REDEMPTION_MS = 350;

/** Backend debounce — absorbs gaps from dropped/reordered WebSocket packets */
export const SPEECH_GAP_DEBOUNCE_MS = 200;

/** Combined offset — used to compensate MIN_OVERLAP_MS in interruption detection */
export const TOTAL_OFFSET_MS = VAD_REDEMPTION_MS + SPEECH_GAP_DEBOUNCE_MS;
