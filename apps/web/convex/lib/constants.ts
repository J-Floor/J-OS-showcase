// apps/web/convex/lib/constants.ts
/**
 * Backend lifecycle constants (Convex runtime). Frontend-only constants such as
 * the WhatsApp invite URL live under `src/` — Convex cannot import across the
 * runtime boundary, so the two have separate homes by design.
 */

/** A denied applicant may re-apply only after this window elapses (6 months). */
export const REAPPLY_DEBOUNCE_MS = 1000 * 60 * 60 * 24 * 30 * 6;

/** How long an applicant has to click the email-confirmation link (7 days). */
export const VERIFY_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export const DOOR_LOG_PAGE_SIZE = 100;

export const NOTIFICATIONS_PAGE_SIZE = 50;

export const UNREAD_COUNT_CAP = 99;
