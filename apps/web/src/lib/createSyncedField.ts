import {
	type Accessor,
	createEffect,
	createSignal,
	on,
	onCleanup,
	untrack,
} from "solid-js";

/** A form field whose value is the local source of truth while editing, kept in
 * sync with an async remote (e.g. a Convex document). */
export type SyncedField<T> = {
	/** Bind to the input's `value`. */
	value: Accessor<T>;
	/** Call from the input handler: updates locally now, schedules the write. */
	set: (value: T) => void;
	/** Force any pending write immediately (e.g. from `onBlur`). */
	flush: () => void;
};

const DEFAULT_DEBOUNCE_MS = 400;

export type SyncedFieldOptions<T> = {
	/** The authoritative value from the backend (e.g. a query accessor). */
	remote: Accessor<T>;
	/** Identity of the record being edited. When it changes the draft hard-resets
	 * to `remote` and any pending write for the previous record is dropped.
	 * Include open-state here if the field lives in a reusable form that should
	 * re-seed each time it opens. */
	key: Accessor<unknown>;
	/** Persists a committed value (the mutation). */
	write: (value: T) => void;
	/** Debounce before the write fires. Default `400`. Use `0` for discrete
	 * controls (selects, date pickers) that should write on every change. */
	debounceMs?: number;
	/** Value equality, used to decide whether the local draft has diverged from
	 * the server. Defaults to `Object.is`; pass {@link shallowArrayEquals} (or
	 * similar) for array/object values. */
	equals?: (a: T, b: T) => boolean;
};

/**
 * Two-way binding between a local form field and an async remote value, without
 * the echo race that bites a naive controlled input bound straight to a Convex
 * query: fast typing gets ahead of the round-trip, the stale echo is written
 * back, and the last characters vanish then reappear.
 *
 * The local signal is the single source of truth for the input. `synced` tracks
 * the last server value we reconciled against — the field is "idle" exactly when
 * the local draft still equals it. While idle, incoming remote changes are
 * adopted live (so a concurrent edit by another user appears as soon as you stop
 * typing that field). Once you type, the draft diverges from `synced` and is
 * held until your own write echoes back — Convex's OCC makes that a last-write-
 * wins resolution per field, which is the intended behaviour for a shared board
 * (no locks, no CRDT).
 */
export function createSyncedField<T>(
	options: SyncedFieldOptions<T>
): SyncedField<T> {
	const isEqual =
		options.equals ?? ((left: T, right: T) => Object.is(left, right));
	const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;

	const [local, setLocal] = createSignal<T>(untrack(options.remote));
	// Last server value we reconciled against (see the doc comment).
	let synced: T = untrack(options.remote);

	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending: { value: T } | undefined;

	function clearTimer(): void {
		if (timer === undefined) {
			return;
		}

		clearTimeout(timer);
		timer = undefined;
	}

	function flush(): void {
		clearTimer();
		if (!pending) {
			return;
		}
		const value = pending.value;
		pending = undefined;
		options.write(value);
	}

	function set(value: T): void {
		setLocal(() => value);
		pending = { value };
		if (debounceMs <= 0) {
			flush();
		} else {
			clearTimer();
			timer = setTimeout(flush, debounceMs);
		}
	}

	// Hard reseed when the edited record (or open-state) changes: drop any write
	// pending for the previous record and snap to the new remote value. Read
	// `remote` untracked so this effect depends only on `key`.
	createEffect(
		on(options.key, () => {
			clearTimer();
			pending = undefined;
			const remoteValue = untrack(options.remote);
			synced = remoteValue;
			setLocal(() => remoteValue);
		})
	);

	// Adopt remote changes only while idle (local still equals the last synced
	// value); hold the user's in-flight edit otherwise.
	createEffect(
		on(
			options.remote,
			(remoteValue) => {
				if (isEqual(untrack(local), synced)) {
					setLocal(() => remoteValue);
				}
				synced = remoteValue;
			},
			{ defer: true }
		)
	);

	// Don't lose the last edit if the owner is disposed mid-debounce.
	onCleanup(flush);

	return { value: local, set, flush };
}

/** Shallow element-wise array equality, for `createSyncedField`'s `equals` on
 * array-valued fields (e.g. a list of assignee ids). */
export function shallowArrayEquals<T>(
	left: readonly T[],
	right: readonly T[]
): boolean {
	return (
		left.length === right.length &&
		left.every((item, index) => item === right[index])
	);
}
