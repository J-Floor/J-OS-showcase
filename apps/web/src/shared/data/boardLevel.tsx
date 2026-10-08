import { useQuery } from "convex-solidjs";
import { type JSX, createContext, useContext } from "solid-js";

import { api } from "../../../convex/_generated/api";

function boardLevelQuery() {
	return useQuery(api.people.listBoardLevel, {}, { keepPreviousData: true });
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
