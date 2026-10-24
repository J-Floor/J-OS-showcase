/** Selectors for elements that take typing or focus, shared so every check
 *  agrees on what counts. */

/** An element that edits text in place. The `i` flag makes the match ASCII
 *  case-insensitive: the HTML attribute value is, CSS matching is not. */
export const CONTENT_EDITABLE =
	'[contenteditable="" i], [contenteditable="true" i], [contenteditable="plaintext-only" i]';

/** A form control a person types or picks in. */
export const FORM_CONTROL = "input, textarea, select";

/** An element that takes keyboard focus. */
export const FOCUSABLE = `${FORM_CONTROL}, button, ${CONTENT_EDITABLE}, [tabindex]:not([tabindex="-1"])`;
