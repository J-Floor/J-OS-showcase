import { useQuery } from "convex-solidjs";
import { type JSX, createContext, useContext } from "solid-js";

import { api } from "../../../../convex/_generated/api";

// convex-solidjs@0.0.3 `useQuery` returns a QueryReturn { data, error,
// isLoading, isStale, refetch }; consumers read `.data()`. `keepPreviousData`
// so a live update refetches WITHOUT re-suspending the enclosing <Suspense>.
//
// These three rosters drive the board console. A route change unmounts the
// page, which would dispose a page-level `useQuery` and tear down its Convex
// subscription — so returning to /community re-subscribes and flashes "Loading…".
// To avoid that, {@link CommunityDataProvider} runs the queries ONCE high in the
// persistent shell (gated to board); the page-level hooks below read that warm
// context instead of subscribing per-mount.
function applicationsQuery() {
	return useQuery(api.applications.list, {}, { keepPreviousData: true });
}
function membersQuery() {
	return useQuery(api.people.listMembers, {}, { keepPreviousData: true });
}
function guestsQuery() {
	return useQuery(api.people.listGuests, {}, { keepPreviousData: true });
}

type CommunityData = {
	applications: ReturnType<typeof applicationsQuery>;
	members: ReturnType<typeof membersQuery>;
	guests: ReturnType<typeof guestsQuery>;
};

const CommunityDataContext = createContext<CommunityData>();

/**
 * Subscribes to the three board rosters once and keeps them warm for the whole
 * session. Mount it high in the shell (it never unmounts on navigation), gated
 * to board, so {@link useApplications}/{@link useMembers}/{@link useGuests} read
 * live data on every visit with no per-mount loading flash.
 */
export function CommunityDataProvider(props: {
	children: JSX.Element;
}): JSX.Element {
	const value: CommunityData = {
		applications: applicationsQuery(),
		members: membersQuery(),
		guests: guestsQuery(),
	};
	return (
		<CommunityDataContext.Provider value={value}>
			{props.children}
		</CommunityDataContext.Provider>
	);
}

// Public hooks: return the warm provider's query when mounted under it (no new
// subscription → no flash), otherwise fall back to subscribing directly (e.g.
// outside the provider). Signature unchanged from the old per-hook files.
export function useApplications() {
	const ctx = useContext(CommunityDataContext);
	return ctx ? ctx.applications : applicationsQuery();
}
export function useMembers() {
	const ctx = useContext(CommunityDataContext);
	return ctx ? ctx.members : membersQuery();
}
export function useGuests() {
	const ctx = useContext(CommunityDataContext);
	return ctx ? ctx.guests : guestsQuery();
}
