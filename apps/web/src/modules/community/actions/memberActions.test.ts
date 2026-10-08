// @vitest-environment happy-dom
// `useMemberActions`/`useGuestActions` pull in `useConfirm`, whose
// `ConfirmProvider`/dialog machinery imports `@j-os/design-system` — under
// the default edge-runtime environment (no `document`) that crashes at
// IMPORT time, not just on render, because Solid's compiled output registers
// DOM event delegation at module load.
import { createRoot } from "solid-js";
import { expect, test, vi } from "vitest";

import { ICONS } from "../../../shared/icons.ts";
import type { GuestRow } from "../columns/guestColumns.tsx";
import type { MemberRow } from "../columns/memberColumns.tsx";

import { useGuestActions } from "./guestActions.ts";
import { useMemberActions } from "./memberActions.ts";
import {
	assertNoCollisions,
	eligible,
	type ActionDescriptor,
} from "./shortcuts.ts";

const kickOutStub: ActionDescriptor<{ _id: string; group: string }> = {
	id: "kick",
	label: "Kick out",
	icon: "block",
	hotkey: "K",
	scope: "members",
	can: (person) => person.group !== "kicked_out",
	run: () => undefined,
};

test("a mixed selection narrows to the rows the action applies to", () => {
	const people = [
		{ _id: "a", group: "members" },
		{ _id: "b", group: "kicked_out" },
		{ _id: "c", group: "board" },
	];
	expect(eligible(kickOutStub, people).map((p) => p._id)).toEqual(["a", "c"]);
});

test("a selection where nothing applies narrows to nothing", () => {
	expect(eligible(kickOutStub, [{ _id: "b", group: "kicked_out" }])).toEqual(
		[]
	);
});

// `useMemberActions` and `useGuestActions` both call Solid hooks (`useTriage`,
// `useConfirm`, `useOpenAgreement`), which need a reactive owner to run under
// but no actual DOM — `createRoot` gives them one without pulling in jsdom or
// @solidjs/testing-library. The root is disposed right after `actions()` is
// read; the returned descriptors are plain closures over mocked, non-reactive
// functions, so calling `run`/`can` on them afterwards is fine.
function withRoot<T>(fn: () => T): T {
	let result: T | undefined;
	createRoot((dispose) => {
		result = fn();
		dispose();
	});
	return result as T;
}

const { kickOutMock, upgradeToMemberMock } = vi.hoisted(() => ({
	kickOutMock: vi.fn(() => Promise.resolve()),
	upgradeToMemberMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("./triage.ts", () => ({
	useTriage: () => ({
		kickOut: kickOutMock,
		upgradeToMember: upgradeToMemberMock,
	}),
}));

// Controls the mocked `useOpenAgreement().loading()` return per test, so the
// richer "hasAgreement AND not loading" rule can be exercised without a real
// Convex client.
const { agreementState, openMock } = vi.hoisted(() => ({
	agreementState: { loading: false },
	openMock: vi.fn(),
}));
vi.mock("../openAgreement.ts", () => ({
	useOpenAgreement: () => ({
		open: openMock,
		loading: () => agreementState.loading,
	}),
}));

function member(fields: {
	_id: string;
	tier: string;
	stage?: string;
	hasAgreement?: boolean;
}): MemberRow {
	return {
		_id: fields._id,
		tier: fields.tier,
		stage: fields.stage ?? "active",
		hasAgreement: fields.hasAgreement ?? false,
		firstName: "Ada",
		lastName: "Lovelace",
	} as unknown as MemberRow;
}

function guest(fields: {
	_id: string;
	tier: string;
	stage?: string;
}): GuestRow {
	return {
		_id: fields._id,
		tier: fields.tier,
		stage: fields.stage ?? "active",
		firstName: "Grace",
		lastName: "Hopper",
	} as unknown as GuestRow;
}

test("useMemberActions offers R/change role, K/kick out, A/view agreement, with no collisions", () => {
	const actions = withRoot(() =>
		useMemberActions({
			onChangeRole: () => undefined,
			group: () => "member",
		}).actions()
	);
	expect(() => {
		assertNoCollisions(actions);
	}).not.toThrow();
	expect(
		actions
			.map((a) => [a.id, a.hotkey, a.scope])
			.sort((a, b) => a[0].localeCompare(b[0]))
	).toEqual([
		["agreement", "A", "members"],
		["kick", "K", "members"],
		["role", "R", "members"],
	]);
});

test("kick out is only available while the person's group isn't kicked_out — the rule liveRows() used to own", () => {
	const groups = new Map([
		["live", "member"],
		["gone", "kicked_out"],
	]);
	const actions = withRoot(() =>
		useMemberActions({
			onChangeRole: () => undefined,
			group: (person) => groups.get(person._id) ?? "member",
		}).actions()
	);
	const kick = actions.find((a) => a.id === "kick")!;
	const live = member({ _id: "live", tier: "member" });
	const gone = member({ _id: "gone", tier: "former" });
	expect(kick.can(live)).toBe(true);
	expect(kick.can(gone)).toBe(false);
	// `eligible`, the shared narrowing the batch bar now uses, agrees.
	expect(eligible(kick, [live, gone])).toEqual([live]);
});

test("view agreement is available only when there IS a signed agreement", () => {
	agreementState.loading = false;
	const actions = withRoot(() =>
		useMemberActions({
			onChangeRole: () => undefined,
			group: () => "member",
		}).actions()
	);
	const agreement = actions.find((a) => a.id === "agreement")!;
	expect(
		agreement.can(member({ _id: "a", tier: "member", hasAgreement: true }))
	).toBe(true);
	expect(
		agreement.can(member({ _id: "b", tier: "member", hasAgreement: false }))
	).toBe(false);
});

test("view agreement uses the shared agreement icon", () => {
	const members = withRoot(() =>
		useMemberActions({
			onChangeRole: () => undefined,
			group: () => "member",
		}).actions()
	);
	expect(members.find((a) => a.id === "agreement")!.icon).toBe(
		ICONS.agreement
	);
	const guests = withRoot(() => useGuestActions().actions());
	expect(guests.find((a) => a.id === "agreement")!.icon).toBe(
		ICONS.agreement
	);
});

test("view agreement disables while a fetch for it is already in flight, even with a signed agreement on file", () => {
	// This is the richer rule `AgreementButton` actually implements
	// (`!hasAgreement || agreement.loading()`) — a version that checks only
	// `hasAgreement` would pass the test above but let a second click during
	// the first fetch open a second blank tab.
	agreementState.loading = true;
	const actions = withRoot(() =>
		useMemberActions({
			onChangeRole: () => undefined,
			group: () => "member",
		}).actions()
	);
	const agreement = actions.find((a) => a.id === "agreement")!;
	expect(
		agreement.can(member({ _id: "a", tier: "member", hasAgreement: true }))
	).toBe(false);
	agreementState.loading = false;
});

test("view agreement's run opens the agreement via useOpenAgreement, not a per-row query", () => {
	openMock.mockClear();
	const actions = withRoot(() =>
		useMemberActions({
			onChangeRole: () => undefined,
			group: () => "member",
		}).actions()
	);
	const agreement = actions.find((a) => a.id === "agreement")!;
	const person = member({ _id: "p1", tier: "member", hasAgreement: true });
	void agreement.run(person);
	expect(openMock).toHaveBeenCalledWith("p1");
});

test("change role's run defers to the caller (opens the dialog) rather than mutating anything itself", () => {
	let opened: unknown;
	const actions = withRoot(() =>
		useMemberActions({
			onChangeRole: (person) => {
				opened = person;
			},
			group: () => "member",
		}).actions()
	);
	const role = actions.find((a) => a.id === "role")!;
	const person = member({ _id: "p1", tier: "member" });
	void role.run(person);
	expect(opened).toBe(person);
});

test("kick out's run confirms, then calls triage.kickOut with the person's id", async () => {
	kickOutMock.mockClear();
	const actions = withRoot(() =>
		useMemberActions({
			onChangeRole: () => undefined,
			group: () => "member",
		}).actions()
	);
	const kick = actions.find((a) => a.id === "kick")!;
	// No <ConfirmProvider> is mounted, so `useConfirm()` falls back to
	// auto-confirm (see confirm.tsx).
	await kick.run(member({ _id: "p1", tier: "member" }));
	expect(kickOutMock).toHaveBeenCalledWith("p1");
});

test("useGuestActions offers M/upgrade, K/kick out and A/view agreement, with no collisions", () => {
	const actions = withRoot(() => useGuestActions().actions());
	expect(() => {
		assertNoCollisions(actions);
	}).not.toThrow();
	// Agreement is now a descriptor here too (was a keyless standalone button),
	// matching the Members tab — same letter `A`, same place in the set.
	expect(
		actions
			.map((a) => [a.id, a.hotkey, a.scope])
			.sort((a, b) => a[0].localeCompare(b[0]))
	).toEqual([
		["agreement", "A", "guests"],
		["kick", "K", "guests"],
		["member", "M", "guests"],
	]);
});

test("guest kick out is unavailable once access has ended (expired stage or former tier)", () => {
	const actions = withRoot(() => useGuestActions().actions());
	const kick = actions.find((a) => a.id === "kick")!;
	expect(kick.can(guest({ _id: "a", tier: "guest", stage: "active" }))).toBe(
		true
	);
	expect(kick.can(guest({ _id: "b", tier: "guest", stage: "expired" }))).toBe(
		false
	);
	expect(kick.can(guest({ _id: "c", tier: "former", stage: "active" }))).toBe(
		false
	);
});

test("guest kick out's run confirms, then calls triage.kickOut", async () => {
	kickOutMock.mockClear();
	const actions = withRoot(() => useGuestActions().actions());
	const kick = actions.find((a) => a.id === "kick")!;
	await kick.run(guest({ _id: "g1", tier: "guest" }));
	expect(kickOutMock).toHaveBeenCalledWith("g1");
});

test("guest upgrade's run confirms, then calls triage.upgradeToMember", async () => {
	upgradeToMemberMock.mockClear();
	const actions = withRoot(() => useGuestActions().actions());
	const memberAction = actions.find((a) => a.id === "member")!;
	await memberAction.run(guest({ _id: "g1", tier: "guest" }));
	expect(upgradeToMemberMock).toHaveBeenCalledWith("g1");
});
