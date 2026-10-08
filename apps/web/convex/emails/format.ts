// apps/web/convex/emails/format.ts
import { formatDateOnlyLong } from "../lib/time.ts";

/**
 * Format an epoch-ms timestamp as a human, UTC-fixed long date (e.g.
 * "18 June 2026"). UTC so the rendered date is stable regardless of the
 * server's timezone and matches across dev/prod.
 */
export function formatEmailDate(ms: number): string {
	return formatDateOnlyLong(ms);
}
