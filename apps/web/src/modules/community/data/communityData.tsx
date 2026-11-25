import { api } from "../../../../convex/_generated/api";
import { useQuery } from "../../../shared/data/useQuery.ts";

// The three board rosters. Each reader subscribes while it is mounted; the
// Convex client shares one subscription between readers of the same query,
// and the query keeper keeps it for a while after the last one leaves, so a
// quick trip to another page does not reload them.
export function useApplications() {
	return useQuery(api.applications.list, {});
}
export function useMembers() {
	return useQuery(api.people.listMembers, {});
}
export function useGuests() {
	return useQuery(api.people.listGuests, {});
}
