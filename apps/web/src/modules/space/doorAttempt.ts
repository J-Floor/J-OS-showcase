import { useQuery } from "convex-solidjs";
import {
	createRoot,
	createSignal,
	getOwner,
	onCleanup,
	type Accessor,
} from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { DoorAttemptView } from "../../../convex/doorLog.ts";

export type DoorAttemptWatch = {
	/** The watched attempt; null when the server has no attempt of the
	 *  caller's under that id, undefined while none is watched or it is
	 *  still loading. */
	result: Accessor<DoorAttemptView | null | undefined>;
	/** Follows the attempt with this id, dropping any other. */
	watch: (id: Id<"doorLog">) => void;
	stop: () => void;
};

/**
 * Follows one door's app attempt live, from the action's `attemptId` until
 * `stop`. Each watch subscribes afresh, under its own root: a query whose
 * args change keeps serving the previous args' result until the new one
 * lands, which here would replay the last attempt's outcome as the new one's
 * and start a countdown before the door has done anything. The root is
 * detached, so the owner's disposal stops it explicitly.
 */
export function createDoorAttempt(): DoorAttemptWatch {
	const owner = getOwner();
	const [query, setQuery] = createSignal<Accessor<
		DoorAttemptView | null | undefined
	> | null>(null);
	let dispose: (() => void) | undefined;
	let closed = false;

	function stop() {
		dispose?.();
		dispose = undefined;
		setQuery(null);
	}

	function watch(id: Id<"doorLog">) {
		stop();
		if (closed) return;
		createRoot((disposeRoot) => {
			dispose = disposeRoot;
			const attempt = useQuery(api.doorLog.attempt, { id });
			setQuery(() => attempt.data);
		}, owner);
	}

	onCleanup(() => {
		closed = true;
		stop();
	});

	return { result: () => query()?.(), watch, stop };
}
