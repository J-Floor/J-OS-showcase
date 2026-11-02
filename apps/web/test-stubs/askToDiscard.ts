import { fireEvent, screen, waitFor } from "@solidjs/testing-library";

/**
 * Presses Escape on `sheet` until it asks to discard, then waits for the
 * prompt titled `title` and returns it.
 *
 * Ark hears Escape a moment after the open, so the first presses can go
 * unheard. Once asked, the prompt's title is built a tick before the prompt
 * is exposed (Ark's presence keeps it `hidden` until then, so no role query
 * sees it), and the prompt already hears Escape: a press in that gap answers
 * "Keep editing". So the presses stop at the title, not at the role.
 */
export async function askToDiscard(
	sheet: HTMLElement,
	title: string
): Promise<HTMLElement> {
	return waitFor(() => {
		if (!screen.queryByText(title))
			fireEvent.keyDown(sheet, { key: "Escape" });
		return screen.getByRole("dialog", { name: title });
	});
}
