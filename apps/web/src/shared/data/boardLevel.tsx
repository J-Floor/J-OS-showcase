import { type JSX, createContext, useContext } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import { useQuery } from "./useQuery.ts";

function boardLevelQuery() {
	return useQuery(api.people.listBoardLevel, {});
}

const BoardLevelContext = createContext<ReturnType<typeof boardLevelQuery>>();

/**
 * Subscribes to the board + admin list once, high in the shell, so a page that
 * mounts on navigation reads it warm instead of re-subscribing and flashing
 * "Loading…" (same reason as `CommunityDataProvider`).
 */
export function BoardLevelProvider(props: {
	children: JSX.Element;
}): JSX.Element {
	return (
		<BoardLevelContext.Provider value={boardLevelQuery()}>
			{props.children}
		</BoardLevelContext.Provider>
	);
}

/** Board + admin with active access: task assignees, project leaders, guest
 *  hosts, note authors. Reads the warm provider when mounted under it, and
 *  subscribes directly otherwise. */
export function useBoardLevel() {
	const ctx = useContext(BoardLevelContext);
	return ctx ?? boardLevelQuery();
}

export type StaffMember = {
	_id: Id<"people">;
	firstName: string;
	lastName: string;
};

/** A board-level person's display name from `useBoardLevel().data()`:
 *  `undefined` while the list loads, `null` when no one has that id (left the
 *  board, or never on it). Callers pick their own fallback for `null`. */
export function staffName(
	staff: StaffMember[] | undefined,
	id: Id<"people">
): string | null | undefined {
	if (staff === undefined) return undefined;
	const found = staff.find((s) => s._id === id);
	return found ? `${found.firstName} ${found.lastName}`.trim() : null;
}
