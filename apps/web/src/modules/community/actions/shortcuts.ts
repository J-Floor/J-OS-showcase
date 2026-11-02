import type { RosterKey } from "../rosterOf.ts";

/** The scope of a person sheet that is in no roster (yet): it owns no keys. */
export const SHEET_SCOPE = "sheet";

/**
 * Where a roster key is live: one roster tab, or the sheet of a person in
 * none. Two actions may share a letter across scopes but never within one.
 */
export type ShortcutScope = RosterKey | typeof SHEET_SCOPE;
