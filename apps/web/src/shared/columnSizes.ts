import type { ColumnSize } from "@j-os/design-system";

/** Wrapping share of the leftover width, for long free text. */
export const FREE_TEXT_SIZE = { min: 260, weight: 2 } satisfies ColumnSize;

/** Wrapping share of the leftover width, for one-line free text. */
export const SHORT_TEXT_SIZE = { min: 200, weight: 1 } satisfies ColumnSize;
