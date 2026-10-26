const EDITABLE_SEGMENT = "[data-part=segment][data-editable]";

/** Whether the element is, or sits inside, an editable date or time segment. */
export function isEditableSegment(element: Element): boolean {
	return element.closest(EDITABLE_SEGMENT) !== null;
}

/**
 * The first editable segment under the element. The separator between
 * segments also carries the segment part but is aria-hidden and not
 * focusable (it has no editable mark), so this skips it.
 */
export function firstEditableSegment(
	container: HTMLElement | undefined
): HTMLElement | undefined {
	return container?.querySelector<HTMLElement>(EDITABLE_SEGMENT) ?? undefined;
}
