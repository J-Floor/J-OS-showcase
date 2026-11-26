import betterAuthTest from "@convex-dev/better-auth/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import type { convexTest } from "convex-test";

type Backend = ReturnType<typeof convexTest>;

/** Register the components a sign-in touches (auth and rate limits) on a
 *  test backend, and return it. */
export function withAuthComponents<B extends Backend>(backend: B): B {
	betterAuthTest.register(backend);
	rateLimiterTest.register(backend);
	return backend;
}
