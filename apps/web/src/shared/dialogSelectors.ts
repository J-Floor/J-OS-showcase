/** Ark's dialog content, which every sheet and dialog renders. */
export const DIALOG_CONTENT = '[data-scope="dialog"][data-part="content"]';

/** The dialog content Ark is actually showing: closed content stays in the DOM. */
export const OPEN_DIALOG_CONTENT = `${DIALOG_CONTENT}[data-state="open"]`;
