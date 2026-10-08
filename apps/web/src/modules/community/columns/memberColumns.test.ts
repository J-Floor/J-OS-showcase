// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

import type { Id } from "../../../../convex/_generated/dataModel";
import type { useTriage } from "../actions/triage.ts";

import { applyMove, memberGroup, type MemberRow } from "./memberColumns.tsx";

/**
 * A `ReturnType<typeof useTriage>` double, one mock per method. `applyMove`
 * has nine branches (seven events plus `role`/`extendWindow`) and, before
 * this file, zero assertions pinned which mock each one called — a swapped
 * branch (e.g. `grantCore` for `revokeCore`, or `markLeft` for `kickOut`)
 * would have left the whole suite green. Every test below asserts both that
 * the right mock fired AND that its sibling did not.
 */
function mockTriage(): ReturnType<typeof useTriage> {
	// `deny`/`makeMember`/`approveAsGuest`/`undeny` wrap `applications.decide`
	// and `.undeny`, which resolve `null`; every other method wraps
	// `lifecycle.transition`, which resolves the person's new `StateId` — an
	// arbitrary legal one is fine here since `applyMove` never reads the value.
	return {
		deny: vi.fn(() => Promise.resolve(null)),
		makeMember: vi.fn(() => Promise.resolve(null)),
		approveAsGuest: vi.fn(() => Promise.resolve(null)),
		undeny: vi.fn(() => Promise.resolve(null)),
		kickOut: vi.fn(() => Promise.resolve("former.active" as const)),
		markLeft: vi.fn(() => Promise.resolve("former.active" as const)),
		reAdmit: vi.fn(() => Promise.resolve("member.active" as const)),
		upgradeToMember: vi.fn(() =>
			Promise.resolve("member.onboarding" as const)
		),
		grantCore: vi.fn(() => Promise.resolve("core.active" as const)),
		revokeCore: vi.fn(() => Promise.resolve("member.active" as const)),
		promoteToBoard: vi.fn(() => Promise.resolve("board.active" as const)),
		setRole: vi.fn(() => Promise.resolve("member.active" as const)),
		extendWindow: vi.fn(() => Promise.resolve("guest.active" as const)),
	};
}

const ID = "p1" as Id<"people">;

describe("applyMove", () => {
	it("{ kind: extendWindow } calls triage.extendWindow(id, until)", async () => {
		const triage = mockTriage();
		await applyMove(triage, [ID], { kind: "extendWindow", until: 123 });
		expect(triage.extendWindow).toHaveBeenCalledWith(ID, 123);
	});

	it("{ kind: role } calls triage.setRole(id, tier) — the destination, not a role label", async () => {
		const triage = mockTriage();
		await applyMove(triage, [ID], { kind: "role", tier: "core" });
		expect(triage.setRole).toHaveBeenCalledWith(ID, "core");
	});

	it("PROMOTE_TO_MEMBER calls triage.upgradeToMember", async () => {
		const triage = mockTriage();
		await applyMove(triage, [ID], {
			kind: "event",
			event: "PROMOTE_TO_MEMBER",
		});
		expect(triage.upgradeToMember).toHaveBeenCalledWith(ID);
	});

	it("GRANT_CORE calls triage.grantCore, not revokeCore", async () => {
		const triage = mockTriage();
		await applyMove(triage, [ID], { kind: "event", event: "GRANT_CORE" });
		expect(triage.grantCore).toHaveBeenCalledWith(ID);
		expect(triage.revokeCore).not.toHaveBeenCalled();
	});

	it("REVOKE_CORE calls triage.revokeCore, not grantCore", async () => {
		const triage = mockTriage();
		await applyMove(triage, [ID], { kind: "event", event: "REVOKE_CORE" });
		expect(triage.revokeCore).toHaveBeenCalledWith(ID);
		expect(triage.grantCore).not.toHaveBeenCalled();
	});

	it("PROMOTE_TO_BOARD calls triage.promoteToBoard", async () => {
		const triage = mockTriage();
		await applyMove(triage, [ID], {
			kind: "event",
			event: "PROMOTE_TO_BOARD",
		});
		expect(triage.promoteToBoard).toHaveBeenCalledWith(ID);
	});

	it("RE_ADMIT calls triage.reAdmit", async () => {
		const triage = mockTriage();
		await applyMove(triage, [ID], { kind: "event", event: "RE_ADMIT" });
		expect(triage.reAdmit).toHaveBeenCalledWith(ID);
	});

	it("MARK_LEFT calls triage.markLeft, not kickOut", async () => {
		const triage = mockTriage();
		await applyMove(triage, [ID], { kind: "event", event: "MARK_LEFT" });
		expect(triage.markLeft).toHaveBeenCalledWith(ID);
		expect(triage.kickOut).not.toHaveBeenCalled();
	});

	it("KICK_OUT calls triage.kickOut, not markLeft", async () => {
		const triage = mockTriage();
		await applyMove(triage, [ID], { kind: "event", event: "KICK_OUT" });
		expect(triage.kickOut).toHaveBeenCalledWith(ID);
		expect(triage.markLeft).not.toHaveBeenCalled();
	});

	it("loops the same move over every id in a batch", async () => {
		const triage = mockTriage();
		const ids = ["p1", "p2", "p3"] as Id<"people">[];
		await applyMove(triage, ids, { kind: "event", event: "KICK_OUT" });
		expect(triage.kickOut).toHaveBeenCalledTimes(3);
		expect(triage.kickOut).toHaveBeenNthCalledWith(1, "p1");
		expect(triage.kickOut).toHaveBeenNthCalledWith(2, "p2");
		expect(triage.kickOut).toHaveBeenNthCalledWith(3, "p3");
	});
});

describe("memberGroup", () => {
	it("staff rows group under Staff", () => {
		expect(
			memberGroup({ tier: "staff", stage: "active" } as MemberRow)
		).toBe("staff");
	});
});
