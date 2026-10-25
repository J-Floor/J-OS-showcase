/**
 * What a sheet that saves as you type says about its writes: every field
 * reports its own write to the tracker the sheet provides, and
 * `Sheet.SaveStatus` shows the sum.
 */
import { ResultAsync } from "neverthrow";
import {
	type Accessor,
	createContext,
	createSignal,
	onCleanup,
	useContext,
} from "solid-js";

/** How long "Changes saved" stays after the last write resolved. */
export const SAVED_VISIBLE_MS = 3000;

export type SaveState = "idle" | "pending" | "saved" | "failed";

/** One field's write: `pending()` as it starts waiting (the debounce, then
 *  the request), `settle` with the request and how to send it again. */
export type TrackedField = {
	pending: () => void;
	settle: (write: Promise<unknown>, retry: () => void) => void;
	/** Withdraws the field (nothing of it is waiting any more, say the
	 *  record it edits changed): a write of it settling later is ignored. */
	clear: () => void;
};

export type SaveTracker = {
	/** The field `id`: the same one each time it is asked for. */
	track: (id: string) => TrackedField;
	/** Pending while any field is; else failed while any field is; else
	 *  saved for {@link SAVED_VISIBLE_MS} after a write resolved; else idle. */
	state: Accessor<SaveState>;
	/** Re-sends every failed field. */
	retry: () => void;
};

type FieldState = {
	state: "pending" | "saved" | "failed";
	/** Which write of the field this is: only the latest one counts. */
	write: number;
	retry?: () => void;
};

/** A tracker for one surface's fields. Call inside a reactive owner. */
export function createSaveTracker(): SaveTracker {
	const [fields, setFields] = createSignal<ReadonlyMap<string, FieldState>>(
		new Map()
	);
	const [isSavedShown, setSavedShown] = createSignal(false);
	let savedTimer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => {
		clearTimeout(savedTimer);
	});

	function put(id: string, field: FieldState): void {
		setFields((current) => new Map(current).set(id, field));
	}

	function showSaved(): void {
		clearTimeout(savedTimer);
		setSavedShown(true);
		savedTimer = setTimeout(() => {
			setSavedShown(false);
		}, SAVED_VISIBLE_MS);
	}

	const tracked = new Map<string, TrackedField>();

	function track(id: string): TrackedField {
		const known = tracked.get(id);
		if (known) return known;
		const field = createField(id);
		tracked.set(id, field);
		return field;
	}

	function createField(id: string): TrackedField {
		let writes = 0;
		return {
			pending() {
				writes += 1;
				put(id, { state: "pending", write: writes });
			},
			settle(write, retry) {
				const current = writes;
				void ResultAsync.fromPromise(write, (error) => error).then(
					(result) => {
						if (current !== writes) return;
						if (result.isErr()) {
							put(id, { state: "failed", write: current, retry });
							return;
						}
						put(id, { state: "saved", write: current });
						showSaved();
					}
				);
			},
			clear() {
				writes += 1;
				setFields((current) => {
					const next = new Map(current);
					next.delete(id);
					return next;
				});
			},
		};
	}

	function state(): SaveState {
		const states = [...fields().values()].map((field) => field.state);
		if (states.includes("pending")) return "pending";
		if (states.includes("failed")) return "failed";
		return isSavedShown() ? "saved" : "idle";
	}

	function retry(): void {
		for (const field of fields().values()) {
			if (field.state === "failed") field.retry?.();
		}
	}

	return { track, state, retry };
}

/** The tracker of the surface around (a `Sheet.Root`); none outside one. */
export const SaveTrackerContext = createContext<SaveTracker>();

export function useSaveTracker(): SaveTracker | undefined {
	return useContext(SaveTrackerContext);
}
