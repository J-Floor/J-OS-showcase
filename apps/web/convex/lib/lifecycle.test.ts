import { describe, expect, it } from "vitest";

import {
	ALL_EVENTS,
	ALL_STATES,
	legalEvents,
	reduce,
	TABLE,
} from "./lifecycle.ts";
import { IllegalTransitionError, type Facts } from "./lifecycleTypes.ts";

const facts: Facts = {
	verified: true,
	complianceMet: false,
	selfStepsComplete: false,
	everActive: false,
	windowOpen: true,
};

describe("reduce", () => {
	it("grants core to a legacy member with an agreement but no steps", () => {
		const { next } = reduce(
			"member.active",
			{ type: "GRANT_CORE" },
			{ ...facts, complianceMet: true, everActive: true }
		);
		expect(next).toBe("core.active");
	});

	it("still demotes a board member with no agreement into onboarding", () => {
		const { next } = reduce(
			"board.active",
			{ type: "SET_ROLE", tier: "member" },
			{ ...facts, complianceMet: false, everActive: true }
		);
		expect(next).toBe("member.onboarding");
	});

	it("returns an expired guest who never activated to onboarding", () => {
		const { next } = reduce(
			"guest.expired",
			{ type: "EXTEND_WINDOW", until: 1 },
			{ ...facts, complianceMet: true, everActive: false }
		);
		expect(next).toBe("guest.onboarding");
	});

	it("re-opens the document step when a move lands in onboarding for want of the agreement", () => {
		// A guest whose guest agreement does not count as a member one: their
		// ticked document step would leave nothing to sign.
		const RESET = { type: "RESET_STEP", step: "document" };
		const ticked = { ...facts, selfStepsComplete: true };
		const cases = [
			reduce(
				"guest.active",
				{ type: "SET_ROLE", tier: "member" },
				ticked
			),
			reduce("board.active", { type: "SET_ROLE", tier: "core" }, ticked),
			reduce("member.active", { type: "GRANT_CORE" }, ticked),
			reduce("core.active", { type: "REVOKE_CORE" }, ticked),
			reduce(
				"former.active",
				{ type: "RE_ADMIT" },
				{ ...ticked, formerOf: "member" }
			),
			reduce(
				"guest.expired",
				{ type: "EXTEND_WINDOW", until: 1 },
				ticked
			),
			// A re-applicant keeps the steps they ticked before.
			reduce("prospect.verified", { type: "APPROVE_MEMBER" }, ticked),
			reduce(
				"prospect.queued",
				{ type: "APPROVE_GUEST", until: 1 },
				ticked
			),
		];
		for (const { next, effects } of cases) {
			expect(next.endsWith(".onboarding")).toBe(true);
			expect(effects).toContainEqual(RESET);
		}
	});

	it("leaves the document step alone when the agreement already holds", () => {
		const RESET = { type: "RESET_STEP", step: "document" };
		const met = { ...facts, complianceMet: true, selfStepsComplete: true };
		for (const { effects } of [
			reduce("member.active", { type: "SET_ROLE", tier: "core" }, met),
			// Board needs no agreement, so its facts always read compliance met.
			reduce("member.active", { type: "SET_ROLE", tier: "board" }, met),
			reduce("member.active", { type: "GRANT_CORE" }, met),
		])
			expect(effects).not.toContainEqual(RESET);
	});

	it("approves a re-applicant who already holds the target agreement and steps straight into active", () => {
		const met = { ...facts, complianceMet: true, selfStepsComplete: true };
		const member = reduce(
			"prospect.verified",
			{ type: "APPROVE_MEMBER" },
			met
		);
		expect(member.next).toBe("member.active");
		expect(member.effects).not.toContainEqual({
			type: "RESET_STEP",
			step: "document",
		});
		expect(
			reduce("prospect.queued", { type: "APPROVE_GUEST", until: 1 }, met)
				.next
		).toBe("guest.active");
	});

	it("still lands a fresh applicant in onboarding with the approval email", () => {
		// No agreement, no steps, never active: the facts of a first application.
		for (const event of [
			{ type: "APPROVE_MEMBER" },
			{ type: "APPROVE_GUEST", until: 1 },
		] as const) {
			const { next, effects } = reduce("prospect.verified", event, facts);
			expect(next.endsWith(".onboarding")).toBe(true);
			expect(effects).toContainEqual({
				type: "EMAIL",
				template: "approval",
			});
		}
	});

	it("verifies a fresh sign-up and tells the board", () => {
		const { next, effects } = reduce(
			"prospect.unverified",
			{ type: "VERIFY_EMAIL" },
			facts
		);
		expect(next).toBe("prospect.verified");
		expect(effects).toContainEqual({
			type: "EMAIL",
			template: "applicationReceived",
		});
		expect(effects).toContainEqual({ type: "NOTIFY_BOARD" });
	});

	it("approves a verified prospect as a guest, setting the window and the host", () => {
		const until = 1800000000000;
		const { next, effects } = reduce(
			"prospect.verified",
			{ type: "APPROVE_GUEST", until, hostedById: "host123" as never },
			facts
		);
		expect(next).toBe("guest.onboarding");
		expect(effects).toContainEqual({ type: "SET_WINDOW", until });
		expect(effects).toContainEqual({
			type: "SCHEDULE_WINDOW_EXPIRY",
			at: until,
		});
		expect(effects).toContainEqual({ type: "EMAIL", template: "approval" });
		expect(effects).toContainEqual({
			type: "SET_HOST",
			hostedById: "host123",
		});
	});

	it("approves an open-ended guest with no expiry to schedule", () => {
		// The board grants residents with no end date in sight. Before the
		// lifecycle cutover this was the dialog's default; the cutover made
		// `until` mandatory and quietly took the capability away.
		const { next, effects } = reduce(
			"prospect.verified",
			{ type: "APPROVE_GUEST" },
			facts
		);
		expect(next).toBe("guest.onboarding");
		// The window still OPENS — `SET_WINDOW` stamps `accessFrom` — it just
		// never closes.
		expect(effects).toContainEqual({
			type: "SET_WINDOW",
			until: undefined,
		});
		// Nothing to schedule, and scheduling `runAt(undefined)` would throw
		// while scheduling `now` would expire them on the spot.
		expect(effects.some((e) => e.type === "SCHEDULE_WINDOW_EXPIRY")).toBe(
			false
		);
		expect(effects).toContainEqual({ type: "EMAIL", template: "approval" });
		expect(effects).toContainEqual({ type: "RECONCILE_DOOR" });
	});

	it("omits SET_HOST when no host was chosen", () => {
		const { effects } = reduce(
			"prospect.queued",
			{ type: "APPROVE_GUEST", until: 1 },
			facts
		);
		expect(effects.some((e) => e.type === "SET_HOST")).toBe(false);
	});

	it("refuses to approve an unverified prospect", () => {
		expect(() =>
			reduce(
				"prospect.verified",
				{ type: "APPROVE_MEMBER" },
				{ ...facts, verified: false }
			)
		).toThrow(IllegalTransitionError);
	});

	it("activates only when steps and compliance are both satisfied, and reconciles the door", () => {
		expect(() =>
			reduce(
				"member.onboarding",
				{ type: "ONBOARDING_PROGRESSED" },
				facts
			)
		).toThrow(IllegalTransitionError);
		const { next, effects } = reduce(
			"member.onboarding",
			{ type: "ONBOARDING_PROGRESSED" },
			{ ...facts, complianceMet: true, selfStepsComplete: true }
		);
		expect(next).toBe("member.active");
		// ONBOARDING_PROGRESSED is the one transition that turns access ON.
		expect(effects).toContainEqual({ type: "RECONCILE_DOOR" });
	});

	it("promotes a guest to member, re-opening the agreement and leaving the door alone", () => {
		const { next, effects } = reduce(
			"guest.active",
			{ type: "PROMOTE_TO_MEMBER" },
			{ ...facts, complianceMet: true, selfStepsComplete: true }
		);
		expect(next).toBe("member.onboarding");
		expect(effects).toContainEqual({
			type: "RESET_STEP",
			step: "document",
		});
		expect(effects).toContainEqual({
			type: "EMAIL",
			template: "memberUpgrade",
		});
		expect(effects).toContainEqual({ type: "CLEAR_WINDOW" });
		// The spec is explicit: a promotion must not blink the door.
		expect(effects).not.toContainEqual({ type: "RECONCILE_DOOR" });
	});

	it("expires a guest whose window closed and reconciles the door", () => {
		const { next, effects } = reduce(
			"guest.active",
			{ type: "WINDOW_EXPIRED" },
			{ ...facts, windowOpen: false }
		);
		expect(next).toBe("guest.expired");
		expect(effects).toContainEqual({ type: "RECONCILE_DOOR" });
	});

	it("ignores a window-expiry event whose window was extended", () => {
		expect(() =>
			reduce(
				"guest.active",
				{ type: "WINDOW_EXPIRED" },
				{ ...facts, windowOpen: true }
			)
		).toThrow(IllegalTransitionError);
	});

	it("re-extending an expired guest's window does not bypass compliance", () => {
		// A guest who expired while still in guest.onboarding — agreement
		// unsigned, steps incomplete — must land back in onboarding, not
		// active. The target follows the same canActivate policy as SET_ROLE
		// and RE_ADMIT.
		expect(
			reduce("guest.expired", { type: "EXTEND_WINDOW", until: 1 }, facts)
				.next
		).toBe("guest.onboarding");
		expect(
			reduce(
				"guest.expired",
				{ type: "EXTEND_WINDOW", until: 1 },
				{ ...facts, complianceMet: true, selfStepsComplete: true }
			).next
		).toBe("guest.active");
	});

	it("undenies a denied prospect back into the queue and clears deniedAt", () => {
		const { next, effects } = reduce(
			"prospect.denied",
			{ type: "UNDENY" },
			facts
		);
		expect(next).toBe("prospect.queued");
		expect(effects).toContainEqual({ type: "CLEAR_DENIED_AT" });
	});

	it("promotes an active member to the board", () => {
		expect(
			reduce("member.active", { type: "PROMOTE_TO_BOARD" }, facts).next
		).toBe("board.active");
		expect(
			reduce("core.active", { type: "PROMOTE_TO_BOARD" }, facts).next
		).toBe("board.active");
	});

	it("refuses to promote a prospect straight to the board", () => {
		expect(() =>
			reduce("prospect.queued", { type: "PROMOTE_TO_BOARD" }, facts)
		).toThrow(IllegalTransitionError);
	});

	it("grants core only when the member can already activate, and reconciles the door either way", () => {
		// Same compliance policy as SET_ROLE{core} and RE_ADMIT{formerOf:"core"}:
		// a member with no core-variant agreement on file must not land in
		// core.active unconditionally.
		const notYet = reduce("member.active", { type: "GRANT_CORE" }, facts);
		expect(notYet.next).toBe("core.onboarding");
		expect(notYet.effects).toContainEqual({ type: "RECONCILE_DOOR" });
		const granted = reduce(
			"member.active",
			{ type: "GRANT_CORE" },
			{ ...facts, complianceMet: true, selfStepsComplete: true }
		);
		expect(granted.next).toBe("core.active");
		expect(granted.effects).toContainEqual({ type: "RECONCILE_DOOR" });
	});

	it("revokes core to member.onboarding without a member agreement, member.active with one, reconciling the door either way", () => {
		const notYet = reduce("core.active", { type: "REVOKE_CORE" }, facts);
		expect(notYet.next).toBe("member.onboarding");
		expect(notYet.effects).toContainEqual({ type: "RECONCILE_DOOR" });
		const revoked = reduce(
			"core.active",
			{ type: "REVOKE_CORE" },
			{ ...facts, complianceMet: true, selfStepsComplete: true }
		);
		expect(revoked.next).toBe("member.active");
		expect(revoked.effects).toContainEqual({ type: "RECONCILE_DOOR" });
	});

	it("sets a role from anywhere, because seeding and importing must not patch a role", () => {
		expect(
			reduce(
				"prospect.unverified",
				{ type: "SET_ROLE", tier: "admin" },
				facts
			).next
		).toBe("admin.active");
		expect(
			reduce("member.active", { type: "SET_ROLE", tier: "board" }, facts)
				.next
		).toBe("board.active");
	});

	it("demotes a board member, letting the activation guard pick the stage", () => {
		// THE regression guard for this edge. Facts are computed against the
		// event's TARGET tier (see `loadFacts`), so a board member who never
		// signed a member agreement — board tier has no agreement variant, so
		// they never needed one — arrives here with complianceMet false and must
		// land in onboarding. Resolving unconditionally to `.active` would put a
		// member with no agreement on file straight back into the roster, which
		// is the observed failure the whole spec exists to kill.
		expect(
			reduce("board.active", { type: "SET_ROLE", tier: "member" }, facts)
				.next
		).toBe("member.onboarding");
		expect(
			reduce(
				"board.active",
				{ type: "SET_ROLE", tier: "member" },
				{ ...facts, complianceMet: true, selfStepsComplete: true }
			).next
		).toBe("member.active");
		// Same for core, and the door is reconciled either way.
		const demoted = reduce(
			"admin.active",
			{ type: "SET_ROLE", tier: "core" },
			facts
		);
		expect(demoted.next).toBe("core.onboarding");
		expect(demoted.effects).toContainEqual({ type: "RECONCILE_DOOR" });
	});

	it("reconciles the door on every demotion out of board or admin", () => {
		// Only a board/admin person whose access is granted keeps a break-glass key
		// (the break-glass fallback), so leaving board/admin must schedule the
		// per-person revoke — whichever tier and stage they land in.
		for (const from of ["board.active", "admin.active"] as const)
			for (const tier of ["member", "core"] as const)
				for (const f of [
					facts,
					{ ...facts, complianceMet: true, selfStepsComplete: true },
				])
					expect(
						reduce(from, { type: "SET_ROLE", tier }, f).effects
					).toContainEqual({ type: "RECONCILE_DOOR" });
	});

	it("moves between board and admin without an onboarding detour", () => {
		// Neither tier has an agreement variant or self-serve steps, so the
		// activation guard is vacuous for them — and `.onboarding` would be a
		// state they could never leave, because ONBOARDING_PROGRESSED is not an
		// edge from board or admin. Note `facts` here has complianceMet false and
		// selfStepsComplete false: the guard must NOT be consulted.
		expect(
			reduce("board.active", { type: "SET_ROLE", tier: "admin" }, facts)
				.next
		).toBe("admin.active");
		expect(
			reduce("admin.active", { type: "SET_ROLE", tier: "board" }, facts)
				.next
		).toBe("board.active");
	});

	it("imports to active with a signature and to onboarding without one, opening the door", () => {
		const imported = reduce(
			"prospect.unverified",
			{ type: "IMPORT", tier: "core", hasSignature: true },
			facts
		);
		expect(imported.next).toBe("core.active");
		// Importing reconciles the door like every other access change.
		expect(imported.effects).toContainEqual({ type: "RECONCILE_DOOR" });
		expect(
			reduce(
				"prospect.unverified",
				{ type: "IMPORT", tier: "guest", hasSignature: false },
				facts
			).next
		).toBe("guest.onboarding");
	});

	it("returns a kicked core member to core on re-admit", () => {
		expect(
			reduce(
				"former.active",
				{ type: "RE_ADMIT" },
				{
					...facts,
					complianceMet: true,
					selfStepsComplete: true,
					formerOf: "core",
				}
			).next
		).toBe("core.active");
	});

	it("returns former staff, board and admin to their own tier, active", () => {
		// No agreement and no steps: the tiers that never onboard skip the guard.
		for (const formerOf of ["staff", "board", "admin"] as const) {
			expect(
				reduce(
					"former.active",
					{ type: "RE_ADMIT" },
					{ ...facts, formerOf }
				).next
			).toBe(`${formerOf}.active`);
		}
	});

	it("re-admits without compliance into onboarding", () => {
		expect(
			reduce(
				"former.active",
				{ type: "RE_ADMIT" },
				{ ...facts, formerOf: "member" }
			).next
		).toBe("member.onboarding");
	});

	it("resets the score when a denied prospect re-applies", () => {
		const { next, effects } = reduce(
			"prospect.denied",
			{ type: "REAPPLY" },
			facts
		);
		expect(next).toBe("prospect.unverified");
		expect(effects).toContainEqual({ type: "RESET_SCORE" });
	});

	it("allows the edit-before-confirm re-submission from prospect.unverified", () => {
		// reapplyDecision returns "reuse" for an unverified prospect, so REAPPLY
		// must be legal here or every edit-before-confirm submission throws.
		expect(
			reduce("prospect.unverified", { type: "REAPPLY" }, facts).next
		).toBe("prospect.unverified");
	});

	it("sends an expired guest and a former member back through triage", () => {
		expect(reduce("guest.expired", { type: "REAPPLY" }, facts).next).toBe(
			"prospect.unverified"
		);
		expect(
			reduce(
				"former.active",
				{ type: "REAPPLY" },
				{ ...facts, formerOf: "member" }
			).next
		).toBe("prospect.unverified");
	});

	it("drops the window on every edge out of the guest tier", () => {
		const events = [
			{ type: "PROMOTE_TO_MEMBER" },
			{ type: "REAPPLY" },
			{ type: "SET_ROLE", tier: "member" },
			{ type: "SET_ROLE", tier: "core" },
			{ type: "SET_ROLE", tier: "board" },
			{ type: "SET_ROLE", tier: "admin" },
		] as const;
		let checked = 0;
		for (const from of [
			"guest.onboarding",
			"guest.active",
			"guest.expired",
		] as const)
			for (const event of events) {
				if (!TABLE[from]?.[event.type]) continue;
				checked += 1;
				expect(
					reduce(from, event, facts).effects,
					`${from} ${JSON.stringify(event)}`
				).toContainEqual({ type: "CLEAR_WINDOW" });
			}
		// REAPPLY is legal from guest.expired only.
		expect(checked).toBe(16);
	});

	it("drops a window a re-applicant still carries when approved as a member", () => {
		expect(
			reduce("prospect.verified", { type: "APPROVE_MEMBER" }, facts)
				.effects
		).toContainEqual({ type: "CLEAR_WINDOW" });
	});

	it("keeps the window of a non-guest moved between role tiers", () => {
		// An imported member's `accessFrom` is their join date in insights.
		expect(
			reduce("member.active", { type: "SET_ROLE", tier: "core" }, facts)
				.effects
		).not.toContainEqual({ type: "CLEAR_WINDOW" });
	});

	it("sends an event visitor into the application flow without touching the door", () => {
		// Visitor confirm is a field patch, not VERIFY_EMAIL — the only legal
		// machine edge is REAPPLY, so a visitor can apply without emailing the
		// board. RESET_SCORE is a no-op on an unscored visitor; RECONCILE_DOOR
		// is not, and visitors hold no keys.
		for (const from of [
			"visitor.unverified",
			"visitor.verified",
		] as const) {
			const { next, effects } = reduce(from, { type: "REAPPLY" }, facts);
			expect(next).toBe("prospect.unverified");
			expect(effects).toEqual([{ type: "RESET_SCORE" }]);
		}
	});
});

describe("legalEvents", () => {
	it("lists exactly the events TABLE holds for a state", () => {
		expect(legalEvents("member.active").sort()).toEqual(
			[
				"GRANT_CORE",
				"KICK_OUT",
				"MARK_LEFT",
				"ONBOARDING_PROGRESSED",
				"PROMOTE_TO_BOARD",
				"SET_ROLE",
			].sort()
		);
	});

	it("returns an empty list only for an unknown state, never for a real one", () => {
		expect(legalEvents("prospect.verified")).not.toHaveLength(0);
		expect(legalEvents("nope.nope" as never)).toEqual([]);
	});

	it("gives board and admin a non-destructive exit", () => {
		// Both used to be dead ends: KICK_OUT and MARK_LEFT were the only ways
		// out, so correcting a mis-set role meant archiving the person first.
		// SET_ROLE is that exit. The downward moves live in its PAYLOAD — one
		// edge, four destinations — which is why this list has three entries and
		// not six; `ChangeRoleDialog` expands it into one row per target tier.
		for (const state of ["board.active", "admin.active"] as const) {
			expect(legalEvents(state).sort()).toEqual(
				["KICK_OUT", "MARK_LEFT", "SET_ROLE"].sort()
			);
			expect(
				reduce(state, { type: "SET_ROLE", tier: "member" }, facts).next
			).toMatch(/^member\./);
		}
	});
});

describe("totality", () => {
	it("every state/event pair either transitions to a known state or throws IllegalTransitionError", () => {
		// No try/catch: a pair that throws something OTHER than
		// IllegalTransitionError must fail this test, and a pair that returns an
		// unknown state must fail it too. `outcome` records which happened.
		for (const state of ALL_STATES) {
			for (const type of ALL_EVENTS) {
				// `tier` serves both SET_ROLE and IMPORT; there is no `role`
				// any more. With complianceMet and selfStepsComplete both false
				// in `facts`, SET_ROLE resolves to `member.onboarding` here —
				// still a member of ALL_STATES, which is all this test asks.
				const event = {
					type,
					until: 1,
					tier: "member",
					hasSignature: false,
				} as never;
				const outcome = (():
					| { ok: true; next: string }
					| { ok: false; error: unknown } => {
					try {
						return {
							ok: true,
							next: reduce(state, event, facts).next,
						};
					} catch (error) {
						return { ok: false, error };
					}
				})();
				if (outcome.ok) {
					expect(
						ALL_STATES,
						`${state} -[${type}]-> ${outcome.next}`
					).toContain(outcome.next);
				} else {
					expect(
						outcome.error,
						`${state} -[${type}]->`
					).toBeInstanceOf(IllegalTransitionError);
				}
			}
		}
	});

	it("every static TABLE target is a known state", () => {
		for (const node of Object.values(TABLE)) {
			for (const rule of Object.values(node)) {
				if (typeof rule.to === "string")
					expect(ALL_STATES).toContain(rule.to);
			}
		}
	});

	it("ALL_EVENTS has no duplicates and covers every event TABLE mentions", () => {
		expect(new Set(ALL_EVENTS).size).toBe(ALL_EVENTS.length);
		const mentioned = new Set(
			Object.values(TABLE).flatMap((n) => Object.keys(n))
		);
		for (const type of mentioned) expect(ALL_EVENTS).toContain(type);
	});

	it("ALL_STATES covers every key of TABLE", () => {
		for (const state of Object.keys(TABLE))
			expect(ALL_STATES).toContain(state);
	});

	it("every state in ALL_STATES has at least one outgoing edge", () => {
		// The other totality tests can't catch a state dropped from TABLE
		// entirely: reduce() throws IllegalTransitionError for every event on a
		// missing state, which is exactly what the "known state or throws"
		// test's else-branch accepts. This is the forward-direction guard: a
		// state with zero legal events is a stuck state, full stop.
		for (const state of ALL_STATES)
			expect(legalEvents(state), state).not.toHaveLength(0);
	});
});

describe("staff tier", () => {
	it.each([
		"prospect.unverified",
		"member.active",
		"member.onboarding",
		"core.active",
		"board.active",
		"admin.active",
		"former.active",
	] as const)("SET_ROLE{staff} from %s lands in staff.active", (from) => {
		const { next } = reduce(
			from,
			{ type: "SET_ROLE", tier: "staff" },
			facts
		);
		expect(next).toBe("staff.active");
	});

	it("SET_ROLE{staff} from a guest drops the guest window", () => {
		const { next, effects } = reduce(
			"guest.active",
			{ type: "SET_ROLE", tier: "staff" },
			facts
		);
		expect(next).toBe("staff.active");
		expect(effects).toContainEqual({ type: "CLEAR_WINDOW" });
	});

	it("staff.active can leave, change role, and nothing else", () => {
		expect(legalEvents("staff.active").sort()).toEqual(
			["KICK_OUT", "MARK_LEFT", "SET_ROLE"].sort()
		);
	});

	it("SET_ROLE{member} from staff without an agreement lands in onboarding", () => {
		const { next, effects } = reduce(
			"staff.active",
			{ type: "SET_ROLE", tier: "member" },
			facts
		);
		expect(next).toBe("member.onboarding");
		expect(effects).toContainEqual({
			type: "RESET_STEP",
			step: "document",
		});
	});
});
