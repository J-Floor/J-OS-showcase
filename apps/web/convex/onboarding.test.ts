import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./_generated/api";
import schema from "./schema.ts";

const modules = import.meta.glob("./**/*.*s");

describe("onboarding.getState", () => {
	it("reports needsOnboarding for a member in the onboarding stage", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
			});
		});

		const state = await backend
			.withIdentity({ email: "ada@example.com" })
			.query(api.onboarding.getState, {});
		expect(state.needsOnboarding).toBe(true);
		expect(state.hasAccess).toBe(true);
	});

	it("reports no onboarding for an active member and for an expired guest", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			});
			await context.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "Guest",
				tier: "guest",
				stage: "expired",
				stageSince: Date.now(),
			});
		});

		const adaState = await backend
			.withIdentity({ email: "ada@example.com" })
			.query(api.onboarding.getState, {});
		expect(adaState.needsOnboarding).toBe(false);
		const gone = await backend
			.withIdentity({ email: "gone@example.com" })
			.query(api.onboarding.getState, {});
		expect(gone.hasAccess).toBe(false);
		expect(gone.needsOnboarding).toBe(false);
	});
});

async function onboardingMember(backend: ReturnType<typeof convexTest>) {
	return backend.run(async (context) =>
		context.db.insert("people", {
			email: "ada@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			tier: "member",
			stage: "onboarding",
			stageSince: Date.now(),
		})
	);
}

async function personWithTier(
	tier: "prospect" | "guest" | "member" | "former"
) {
	const backend = convexTest(schema, modules);
	await backend.run(async (context) => {
		await context.db.insert("people", {
			email: "ada@example.com",
			firstName: "Ada",
			lastName: "Lovelace",
			tier,
			stage: "active",
			stageSince: Date.now(),
		});
	});
	return backend.withIdentity({ email: "ada@example.com" });
}

describe("onboarding.completeStep", () => {
	it("records a step and writes one audit row naming the person themselves", async () => {
		const backend = convexTest(schema, modules);
		const id = await onboardingMember(backend);

		await backend
			.withIdentity({ email: "ada@example.com" })
			.mutation(api.onboarding.completeStep, { stepId: "rules" });

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.onboarding?.steps.rules).toBeDefined();

		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(events).toMatchObject([
			{ kind: "step", meta: "rules", actorId: id },
		]);
	});

	it("rejects completing the document step (must sign the agreement)", async () => {
		const backend = convexTest(schema, modules);
		await onboardingMember(backend);
		await expect(
			backend
				.withIdentity({ email: "ada@example.com" })
				.mutation(api.onboarding.completeStep, { stepId: "document" })
		).rejects.toThrow(/signing the agreement/);
	});

	it("rejects an unknown step id", async () => {
		const backend = convexTest(schema, modules);
		await onboardingMember(backend);
		await expect(
			backend
				.withIdentity({ email: "ada@example.com" })
				.mutation(api.onboarding.completeStep, { stepId: "wifi" })
		).rejects.toThrow(/Unknown onboarding step/);
	});

	it("rejects whatsapp — it is a board task, not a step the person can do", async () => {
		const backend = convexTest(schema, modules);
		await onboardingMember(backend);
		await expect(
			backend
				.withIdentity({ email: "ada@example.com" })
				.mutation(api.onboarding.completeStep, { stepId: "whatsapp" })
		).rejects.toThrow(/Unknown onboarding step/);
	});

	it("does NOT activate until every self step AND the agreement are done", async () => {
		const backend = convexTest(schema, modules);
		const id = await onboardingMember(backend);
		const asAda = backend.withIdentity({ email: "ada@example.com" });

		for (const stepId of ["welcome", "rules", "visit"]) {
			await asAda.mutation(api.onboarding.completeStep, { stepId });
		}
		// Every self step bar `document` is done, but nothing is signed — so the
		// three ONBOARDING_PROGRESSED events those calls dispatched were all
		// rejected by the activation guard, silently, which is the intended
		// behaviour of applyEventIfLegal.
		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.stage).toBe("onboarding");
		expect(
			// eslint-disable-next-line id-length -- conventional comparator parameter names
			Object.keys(person?.onboarding?.steps ?? {}).sort((a, b) =>
				a.localeCompare(b)
			)
		).toEqual(["rules", "visit", "welcome"]);
		// And the rejections left no transition rows behind.
		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(events.every((event) => event.kind === "step")).toBe(true);
	});

	it("activates on the last step when the agreement is already on file", async () => {
		const backend = convexTest(schema, modules);
		const id = await onboardingMember(backend);
		const asAda = backend.withIdentity({ email: "ada@example.com" });
		await backend.run(async (context) => {
			await context.db.insert("signatures", {
				personId: id,
				email: "ada@example.com",
				variant: "member",
				signedName: "Ada Lovelace",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			await context.db.patch(id, {
				onboarding: {
					steps: { document: { completedAt: Date.now() } },
				},
			});
		});

		for (const stepId of ["welcome", "rules"]) {
			await asAda.mutation(api.onboarding.completeStep, { stepId });
		}
		const stageBefore = await backend.run(async (context) =>
			context.db.get(id)
		);
		expect(stageBefore?.stage).toBe("onboarding");

		await asAda.mutation(api.onboarding.completeStep, { stepId: "visit" });
		const stageAfter = await backend.run(async (context) =>
			context.db.get(id)
		);
		expect(stageAfter?.stage).toBe("active");
	});

	it("an open board task does not gate activation", async () => {
		// The previous test activated with `boardSteps` empty. Asserted here
		// explicitly because it is one of the spec's named regressions.
		const backend = convexTest(schema, modules);
		const id = await onboardingMember(backend);
		const asAda = backend.withIdentity({ email: "ada@example.com" });
		await backend.run(async (context) => {
			await context.db.insert("signatures", {
				personId: id,
				email: "ada@example.com",
				variant: "member",
				signedName: "Ada Lovelace",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			await context.db.patch(id, {
				onboarding: {
					steps: { document: { completedAt: Date.now() } },
					boardSteps: {},
				},
			});
		});
		for (const stepId of ["welcome", "rules", "visit"]) {
			await asAda.mutation(api.onboarding.completeStep, { stepId });
		}
		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.stage).toBe("active");
		expect(person?.onboarding?.boardSteps).toEqual({});
	});

	it("is idempotent — repeating a step keeps one record and one audit row", async () => {
		const backend = convexTest(schema, modules);
		const id = await onboardingMember(backend);
		const asAda = backend.withIdentity({ email: "ada@example.com" });
		await asAda.mutation(api.onboarding.completeStep, { stepId: "rules" });
		await asAda.mutation(api.onboarding.completeStep, { stepId: "rules" });

		const person = await backend.run(async (context) => context.db.get(id));
		expect(Object.keys(person?.onboarding?.steps ?? {})).toEqual(["rules"]);
		const events = await backend.run(async (context) =>
			context.db
				.query("personEvents")
				.withIndex("by_person", (range) => range.eq("personId", id))
				.collect()
		);
		expect(events).toHaveLength(1);
	});

	it("refuses an expired guest mid-onboarding", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "Guest",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
				accessUntil: Date.now() - 1000,
			});
		});
		await expect(
			backend
				.withIdentity({ email: "gone@example.com" })
				.mutation(api.onboarding.completeStep, { stepId: "rules" })
		).rejects.toThrow(/Access expired or revoked/);
	});
});

describe("onboarding.setTourSeen", () => {
	it("sets the tourSeen flag", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
			})
		);
		await backend
			.withIdentity({ email: "ada@example.com" })
			.mutation(api.onboarding.setTourSeen, {});
		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.onboarding?.tourSeen).toBe(true);
	});

	it("refuses a former member and an expired guest", async () => {
		const backend = convexTest(schema, modules);
		const [former, expired] = await backend.run(async (context) => [
			await context.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "G",
				tier: "member",
				stage: "expired",
				stageSince: Date.now(),
			}),
			await context.db.insert("people", {
				email: "late@example.com",
				firstName: "Late",
				lastName: "L",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
				accessUntil: Date.now() - 1000,
			}),
		]);
		for (const email of ["gone@example.com", "late@example.com"]) {
			await expect(
				backend
					.withIdentity({ email })
					.mutation(api.onboarding.setTourSeen, {})
			).rejects.toThrow(/Access expired or revoked/);
		}
		const rows = await backend.run(async (context) => [
			await context.db.get(former),
			await context.db.get(expired),
		]);
		expect(rows.map((row) => row?.onboarding?.tourSeen)).toEqual([
			undefined,
			undefined,
		]);
	});
});

describe("getOnboardingHost", () => {
	it("returns the host name + phone for a guest", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			const hostId = await context.db.insert("people", {
				email: "host@example.com",
				firstName: "Ho",
				lastName: "St",
				phone: "+1 555 0100",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
			});
			await context.db.insert("people", {
				email: "gia@example.com",
				firstName: "Gia",
				lastName: "Guest",
				tier: "guest",
				stage: "onboarding",
				stageSince: Date.now(),
				hostedById: hostId,
			});
		});

		expect(
			await backend
				.withIdentity({ email: "gia@example.com" })
				.query(api.onboarding.getOnboardingHost, {})
		).toEqual({ name: "Ho St", phone: "+1 555 0100" });
	});

	it("returns null for a member (no host)", async () => {
		const backend = convexTest(schema, modules);
		await backend.run(async (context) => {
			await context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
			});
		});
		expect(
			await backend
				.withIdentity({ email: "ada@example.com" })
				.query(api.onboarding.getOnboardingHost, {})
		).toBeNull();
	});
});

describe("onboarding.setDoorsIntroSeen", () => {
	it("stamps the caller's own row", async () => {
		const backend = convexTest(schema, modules);
		const [ada, bob] = await backend.run(async (context) => [
			await context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			}),
			await context.db.insert("people", {
				email: "bob@example.com",
				firstName: "Bob",
				lastName: "B",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			}),
		]);
		const before = Date.now();
		await backend
			.withIdentity({ email: "ada@example.com" })
			.mutation(api.onboarding.setDoorsIntroSeen, {});
		const [adaRow, bobRow] = await backend.run(async (context) => [
			await context.db.get(ada),
			await context.db.get(bob),
		]);
		expect(adaRow?.doorsIntroSeenAt).toBeGreaterThanOrEqual(before);
		expect(bobRow?.doorsIntroSeenAt).toBeUndefined();
	});

	it("keeps the first timestamp when called again", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "board",
				stage: "active",
				stageSince: Date.now(),
				doorsIntroSeenAt: 123,
			})
		);
		await backend
			.withIdentity({ email: "ada@example.com" })
			.mutation(api.onboarding.setDoorsIntroSeen, {});
		const seen = await backend.run(async (context) => context.db.get(id));
		expect(seen?.doorsIntroSeenAt).toBe(123);
	});

	it("refuses a caller with no person row", async () => {
		const backend = convexTest(schema, modules);
		await expect(
			backend
				.withIdentity({ email: "nobody@example.com" })
				.mutation(api.onboarding.setDoorsIntroSeen, {})
		).rejects.toThrow(/Forbidden/);
	});

	it("refuses a former member and writes nothing", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run(async (context) =>
			context.db.insert("people", {
				email: "gone@example.com",
				firstName: "Gone",
				lastName: "G",
				tier: "member",
				stage: "expired",
				stageSince: Date.now(),
			})
		);
		await expect(
			backend
				.withIdentity({ email: "gone@example.com" })
				.mutation(api.onboarding.setDoorsIntroSeen, {})
		).rejects.toThrow(/Access expired or revoked/);
		const unseen = await backend.run(async (context) => context.db.get(id));
		expect(unseen?.doorsIntroSeenAt).toBeUndefined();
	});
});

describe("the retired door-key step", () => {
	it("a person who completed the door-key step before the switchover still activates on the remaining steps", async () => {
		const backend = convexTest(schema, modules);
		const id = await backend.run(async (context) => {
			const personId = await context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Lovelace",
				tier: "member",
				stage: "onboarding",
				stageSince: Date.now(),
				onboarding: {
					steps: {
						welcome: { completedAt: 1 },
						document: { completedAt: 1 },
						doorKey: { completedAt: 1 },
					},
				},
			});
			await context.db.insert("signatures", {
				personId,
				email: "ada@example.com",
				variant: "member",
				signedName: "Ada Lovelace",
				agreementVersion: "1",
				agreementHash: "h",
				signedAt: Date.now(),
			});
			return personId;
		});
		const asAda = backend.withIdentity({ email: "ada@example.com" });
		await asAda.mutation(api.onboarding.completeStep, { stepId: "rules" });
		await asAda.mutation(api.onboarding.completeStep, { stepId: "visit" });

		const person = await backend.run(async (context) => context.db.get(id));
		expect(person?.stage).toBe("active");
		// The legacy record is left alone: the steps record is open-ended.
		expect(person?.onboarding?.steps.doorKey).toEqual({ completedAt: 1 });
	});
});

describe("onboarding.resume", () => {
	const ALL_STEPS = {
		welcome: { completedAt: 1 },
		document: { completedAt: 1 },
		rules: { completedAt: 1 },
		visit: { completedAt: 1 },
	};

	async function seedGuest(
		backend: ReturnType<typeof convexTest>,
		hasSignature: boolean
	) {
		return backend.run(async (context) => {
			const now = Date.now();
			const id = await context.db.insert("people", {
				email: "ana@example.com",
				firstName: "Ana",
				lastName: "Stuck",
				tier: "guest",
				stage: "onboarding",
				stageSince: now,
				onboarding: { steps: ALL_STEPS },
			});
			if (hasSignature)
				await context.db.insert("signatures", {
					personId: id,
					email: "ana@example.com",
					variant: "guest",
					signedName: "Ana Stuck",
					agreementVersion: "test",
					agreementHash: "",
					signedAt: now,
				});
			return id;
		});
	}

	it("activates a guest whose steps and agreement are complete", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedGuest(backend, true);
		const result = await backend
			.withIdentity({ email: "ana@example.com" })
			.mutation(api.onboarding.resume, {});
		expect(result).toEqual({ activated: true });
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.stage).toBe("active");
	});

	it("leaves a guest without an agreement in onboarding", async () => {
		const backend = convexTest(schema, modules);
		const id = await seedGuest(backend, false);
		const result = await backend
			.withIdentity({ email: "ana@example.com" })
			.mutation(api.onboarding.resume, {});
		expect(result).toEqual({ activated: false });
		const person = await backend.run((context) => context.db.get(id));
		expect(person?.stage).toBe("onboarding");
	});

	it("refuses someone who is not onboarding", async () => {
		const backend = convexTest(schema, modules);
		await backend.run((context) =>
			context.db.insert("people", {
				email: "ada@example.com",
				firstName: "Ada",
				lastName: "Active",
				tier: "member",
				stage: "active",
				stageSince: Date.now(),
			})
		);
		await expect(
			backend
				.withIdentity({ email: "ada@example.com" })
				.mutation(api.onboarding.resume, {})
		).rejects.toThrow("not in an onboarding state");
	});
});

describe("onboarding.whatsappInvite", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it("gives an entitled member the configured invite link", async () => {
		vi.stubEnv(
			"WHATSAPP_INVITE_URL",
			"https://chat.whatsapp.com/EXAMPLEINVITE"
		);
		const asAda = await personWithTier("member");
		expect(await asAda.query(api.onboarding.whatsappInvite, {})).toBe(
			"https://chat.whatsapp.com/EXAMPLEINVITE"
		);
	});

	it("returns null when the link is not configured", async () => {
		vi.stubEnv("WHATSAPP_INVITE_URL", undefined);
		const asAda = await personWithTier("member");
		expect(await asAda.query(api.onboarding.whatsappInvite, {})).toBeNull();
	});

	it("refuses a signed-out caller", async () => {
		vi.stubEnv(
			"WHATSAPP_INVITE_URL",
			"https://chat.whatsapp.com/EXAMPLEINVITE"
		);
		const backend = convexTest(schema, modules);
		await expect(
			backend.query(api.onboarding.whatsappInvite, {})
		).rejects.toThrow(/Not authenticated/);
	});

	for (const tier of ["prospect", "former"] as const) {
		it(`refuses a ${tier}`, async () => {
			vi.stubEnv(
				"WHATSAPP_INVITE_URL",
				"https://chat.whatsapp.com/EXAMPLEINVITE"
			);
			const asAda = await personWithTier(tier);
			await expect(
				asAda.query(api.onboarding.whatsappInvite, {})
			).rejects.toThrow(/Forbidden/);
		});
	}
});
