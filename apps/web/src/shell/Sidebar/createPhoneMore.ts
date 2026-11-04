import { useLocation } from "@solidjs/router";
import { type Accessor, createEffect, createSignal, on } from "solid-js";

export type PhoneMore = {
	isOpen: Accessor<boolean>;
	setOpen: (isOpen: boolean) => void;
	toggle: () => void;
	close: () => void;
};

/** Calls `close` when the page changes by any route: Back, a palette pick, a
 *  link. Call it inside the router. */
function closeOnNavigation(close: () => void): void {
	const location = useLocation();
	createEffect(
		on(
			() => location.pathname,
			() => {
				close();
			},
			{ defer: true }
		)
	);
}

/**
 * The phone bar's more item: whether its sheet is open, and the page change
 * that closes it. The sheet is a design-system `Dialog`, which owns the
 * scrim, Escape, the outside press, the focus trap, the swipe down and the
 * morph; this is only the request it follows. A toggle reads the request, not
 * what the dialog has shown so far, so a quick second tap undoes the first.
 */
export function createPhoneMore(): PhoneMore {
	const [isOpen, setOpen] = createSignal(false);
	function close(): void {
		setOpen(false);
	}
	closeOnNavigation(close);
	return {
		isOpen,
		setOpen,
		toggle: () => {
			setOpen(!isOpen());
		},
		close,
	};
}
