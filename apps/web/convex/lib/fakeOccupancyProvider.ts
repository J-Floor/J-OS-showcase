// In-memory OccupancyProvider for occupancy tests. A real module (not inline
// in a test) so every test that injects a provider shares one fake.
import {
	err,
	errAsync,
	ok,
	okAsync,
	type Result,
	type ResultAsync,
} from "neverthrow";

import type { OccupancyError } from "./errors/occupancy.ts";
import type { OccupancyProvider } from "./occupancy/provider.ts";
import type { OccupancyUpdate } from "./occupancy/update.ts";

export class FakeOccupancyProvider implements OccupancyProvider {
	count: number | undefined;
	updates: OccupancyUpdate[] | undefined;
	/** When set, every call fails with this error. */
	failure: OccupancyError | undefined;
	readonly maxSilenceMs: number | undefined;
	calls: { reads: number; bodies: string[] } = { reads: 0, bodies: [] };
	readCount: (() => ResultAsync<number, OccupancyError>) | undefined;
	parseWebhook:
		| ((
				body: string,
				headers: Headers
		  ) => Result<OccupancyUpdate[], OccupancyError>)
		| undefined;

	constructor(options: {
		count?: number;
		updates?: OccupancyUpdate[];
		maxSilenceMs?: number;
	}) {
		this.maxSilenceMs = options.maxSilenceMs;
		this.count = options.count;
		this.updates = options.updates;
		this.readCount =
			options.count === undefined
				? undefined
				: () => {
						this.calls.reads++;
						return this.failure
							? errAsync(this.failure)
							: okAsync(this.count ?? 0);
					};
		this.parseWebhook =
			options.updates === undefined
				? undefined
				: (body) => {
						this.calls.bodies.push(body);
						return this.failure
							? err(this.failure)
							: ok(this.updates ?? []);
					};
	}
}
