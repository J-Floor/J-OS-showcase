/**
 * The DOM contract between the table's markup and the width measurement:
 * Table.tsx and SkeletonRows.tsx put these attributes on, and the measurement
 * finds its cells by them.
 */
export const COLUMN_ID_ATTR = "data-column-id";
export const HEADER_CELL_ATTR = "data-header-cell";
export const HEADER_LABEL_ATTR = "data-header-label";
export const HEADER_ACTIONS_ATTR = "data-header-actions";
export const TEXT_CELL_ATTR = "data-text-cell";

/** A header cell of a data column. */
export const HEADER_COLUMN_SELECTOR = `th[${COLUMN_ID_ATTR}]`;
/** A body cell showing text in the body font. */
export const BODY_TEXT_CELL_SELECTOR = `tbody [${TEXT_CELL_ATTR}]`;
