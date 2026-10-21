// The one place generic code gets an occupancy provider: the injected test
// fake when one is set, otherwise the counter adapter built from this
// deployment's configuration. No counter is installed yet, so there is no
// adapter and occupancy is off. Installing one is an adapter file under
// lib/occupancy/providers/ plus its entry point here; only that adapter reads
// its configuration off `process.env`.
import {
	injectedOccupancyProvider,
	type OccupancyProvider,
} from "./occupancy/provider.ts";

export function occupancyProvider(): OccupancyProvider | null {
	return injectedOccupancyProvider() ?? null;
}

/** Whether occupancy is on: a provider exists for this deployment. */
export function occupancyEnabled(): boolean {
	return occupancyProvider() !== null;
}
