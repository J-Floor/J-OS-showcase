import { api } from "../../convex/_generated/api";
import { useQuery } from "../shared/data/useQuery.ts";

export function useRole() {
	return useQuery(api.people.getCurrentRole, {});
}
