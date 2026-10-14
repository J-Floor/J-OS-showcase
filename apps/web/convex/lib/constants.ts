// apps/web/convex/lib/constants.ts
/**
 * Backend lifecycle constants (Convex runtime). Frontend-only constants such as
 * the WhatsApp invite URL live under `src/` — Convex cannot import across the
 * runtime boundary, so the two have separate homes by design.
 */

export const DAY_MS = 86_400_000;

export const DAYS_PER_WEEK = 7;

export const NINETY_DAYS = 7_776_000_000;

export const HEX_RADIX = 16;

/** A denied applicant may re-apply only after this window elapses (6 months). */
export const REAPPLY_DEBOUNCE_MS = 15_552_000_000;

/** How long an applicant has to click the email-confirmation link (7 days). */
export const VERIFY_TTL_MS = 604_800_000;

export const DOOR_LOG_PAGE_SIZE = 100;

export const NOTIFICATIONS_PAGE_SIZE = 50;

export const UNREAD_COUNT_CAP = 99;
