/**
 * Run a DOM update as a View Transition, so an element that carries the same
 * `view-transition-name` before and after morphs between the two boxes.
 *
 * The palette opens through Ark's dialog machine, which mounts its content on
 * a later task, not synchronously with the signal. The transition snapshots the
 * "after" state when the callback's promise settles, so it waits one task —
 * otherwise the snapshot is taken before the dialog exists and nothing morphs.
 *
 * Falls back to a plain update where the API is missing or the user asked for
 * reduced motion; the dialog's own CSS animation covers that case.
 *
 * Resolves once the transition has finished (never rejects), so a caller can
 * sequence work after it. Not `updateCallbackDone`: anything the update
 * schedules for the next frame (the palette's combobox refocusing its input)
 * runs after that, and would undo whatever the caller did.
 */
export function morph(update: () => void): Promise<void> {
	const reduced =
		typeof matchMedia === "function" &&
		matchMedia("(prefers-reduced-motion: reduce)").matches;
	if (reduced || typeof document.startViewTransition !== "function") {
		update();
		return Promise.resolve();
	}
	const transition = document.startViewTransition(async () => {
		update();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	});
	return transition.finished.then(
		() => undefined,
		() => undefined
	);
}
