import {
	AbilityBuilder,
	createMongoAbility,
	type MongoAbility,
} from "@casl/ability";
import {
	createContext,
	createMemo,
	useContext,
	Show,
	type Accessor,
	type JSX,
} from "solid-js";

import {
	ACCESS_TIERS,
	isBoardLevel,
	isCommunityTier,
} from "../../convex/lib/roles.ts";

/**
 * App authorization, built on CASL (`@casl/ability` is framework-agnostic; this
 * file is the thin Solid binding — there is no `@casl/solid`). The Convex
 * `requireRole` guards remain the source of truth on the server; this is purely
 * for gating UI affordances (tabs, action buttons) so users aren't shown
 * controls they can't use.
 */
export type Action = "view" | "manage" | "create";
export type Subject =
	// Page-level: who can see the Community page (member directory + board
	// triage console). Distinct from the "Members" roster subject below so the
	// page name doesn't collide with the member role.
	| "Community"
	| "Applications"
	| "Members"
	| "Guests"
	| "Space"
	// The Space page's Wi-Fi, occupancy, countdown and house rules: everything but the door.
	| "SpaceInfo"
	| "Events"
	// The bell, the push prompt and the notifications drawer.
	| "Notifications"
	| "Tasks"
	| "Inventory";
export type AppAbility = MongoAbility<[Action, Subject]>;
export type Role = (typeof ACCESS_TIERS)[number] | "none";

export function defineAbilityFor(role: Role): AppAbility {
	const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
	if (isBoardLevel(role)) {
		// Full management console: the Community page plus each roster tab.
		for (const subject of [
			"Community",
			"Applications",
			"Members",
			"Guests",
		] as const) {
			can("view", subject);
			can("manage", subject);
		}
		// Board/admin Tasks module (kanban + projects).
		can("view", "Tasks");
		can("manage", "Tasks");
		can("view", "Inventory");
		can("manage", "Inventory");
		// Board/admin can create events and manage the Events module; `view` is
		// granted to everyone (incl. guests) below.
		can("create", "Events");
		can("manage", "Events");
		// Board/admin can edit the space's Wi-Fi credentials; `view` is granted
		// to everyone below.
		can("manage", "Space");
	} else if (role === "core") {
		// Core member: a member who additionally gets the full Tasks module
		// (view + manage tasks/projects). No triage console, no Community page.
		can("view", "Tasks");
		can("manage", "Tasks");
	}
	// Everyone with access, staff included. `Community` here grants only the
	// read-only member-facing view: the page gates its board triage tabs on
	// `Applications` (board/admin only) and falls back to the board-contacts
	// directory, which the server likewise exposes to every signed-in tier
	// (see people.listBoardContacts). For staff that is all there is: the door
	// and the board contacts.
	if (role !== "none") {
		can("view", "Community");
		can("view", "Space");
	}
	// The community: everyone with access except staff.
	if (isCommunityTier(role)) {
		can("view", "SpaceInfo");
		can("view", "Events");
		can("view", "Notifications");
	}
	return build();
}

const AbilityContext = createContext<Accessor<AppAbility>>();

export function AbilityProvider(props: {
	role: Role;
	children: JSX.Element;
}): JSX.Element {
	// Reactive: rebuilds if the role resolves/changes (props are tracked getters).
	const ability = createMemo(() => defineAbilityFor(props.role));
	return (
		<AbilityContext.Provider value={ability}>
			{props.children}
		</AbilityContext.Provider>
	);
}

export function useAbility(): Accessor<AppAbility> {
	const ctx = useContext(AbilityContext);
	if (!ctx) {
		throw new Error("useAbility must be used within an <AbilityProvider>");
	}
	return ctx;
}

/**
 * Renders `children` only when the current ability permits action `I` on a
 * subject. The subject is passed via whichever grammatical alias reads best —
 * `a` / `an` / `the` (mirroring CASL's React `Can` aliases); they are
 * equivalent. Pass exactly one.
 */
export function Can(props: {
	I: Action;
	a?: Subject;
	an?: Subject;
	the?: Subject;
	children: JSX.Element;
	fallback?: JSX.Element;
}): JSX.Element {
	const ability = useAbility();
	function allowed(): boolean {
		const subject = props.a ?? props.an ?? props.the;
		return subject != null && ability().can(props.I, subject);
	}
	return (
		<Show when={allowed()} fallback={props.fallback}>
			{props.children}
		</Show>
	);
}
