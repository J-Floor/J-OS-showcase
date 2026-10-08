import { useQuery } from "convex-solidjs";

import { api } from "../../convex/_generated/api";

export function useRole() {
	return useQuery(api.people.getCurrentRole, {});
}
