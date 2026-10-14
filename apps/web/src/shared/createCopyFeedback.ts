import { createSignal, onCleanup } from "solid-js";

const COPIED_RESET_MS = 1500;

/**
 * Copy-to-clipboard state for a copy button: writes `text()` on `copy()` and
 * flips `copied()` for 1.5s, so the button can briefly show a tick/"Copied".
 * `text` is read at copy time, not on creation. A plain helper (not a
 * component) so `onCleanup` still registers against the caller's own owner.
 */
export function createCopyFeedback(text: () => string): {
	copied: () => boolean;
	copy: () => void;
} {
	const [copied, setCopied] = createSignal(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => {
		clearTimeout(timer);
	});

	function copy(): void {
		void navigator.clipboard.writeText(text());
		setCopied(true);
		clearTimeout(timer);
		timer = setTimeout(() => {
			setCopied(false);
		}, COPIED_RESET_MS);
	}

	return { copied, copy };
}
