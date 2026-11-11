import type { convexTest } from "convex-test";

import { components } from "../convex/_generated/api";
import { authUserById } from "../convex/lib/authRecords.ts";

type Backend = ReturnType<typeof convexTest>;

/** Create a login for `email` in the auth component; returns its id. */
export async function seedLogin(
	backend: Backend,
	email: string
): Promise<string> {
	const user = (await backend.mutation(components.betterAuth.adapter.create, {
		input: {
			model: "user",
			data: {
				email,
				name: "",
				emailVerified: true,
				createdAt: 1,
				updatedAt: 1,
			},
		},
	})) as { _id: string };
	return user._id;
}

/** The email login `userId` carries now, or null when it is gone. */
export async function loginEmail(
	backend: Backend,
	userId: string
): Promise<string | null> {
	const user = await backend.run((context) => authUserById(context, userId));
	return user?.email ?? null;
}
