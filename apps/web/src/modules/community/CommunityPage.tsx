import { TableSkeleton, Tabs } from "@j-os/design-system";
import { useSearchParams } from "@solidjs/router";
import { createEffect, Show } from "solid-js";

import type { Id } from "../../../convex/_generated/dataModel";
import { Can } from "../../lib/ability.tsx";
import { createEntitySelection } from "../../shared/entity/createEntitySelection.ts";

import { ExportActions } from "./actions/ExportActions.tsx";
import styles from "./CommunityPage.module.scss";
import {
	useApplications,
	useGuests,
	useMembers,
} from "./data/communityData.tsx";
import { InsightsTab } from "./insights/InsightsTab.tsx";
import { MemberCommunity } from "./MemberCommunity.tsx";
import { MyProfile } from "./MyProfile.tsx";
import { ApplicationsTab } from "./tabs/ApplicationsTab.tsx";
import { GuestsTab } from "./tabs/GuestsTab.tsx";
import { MembersTab } from "./tabs/MembersTab.tsx";
import type { PersonRef } from "./tabs/TabProps.ts";

// Insights last: the three rosters are what the board opens this page to do,
// and a dashboard in front of them would put a read-only tab between them and
// the work. It is also the only tab with no drawer, which is why it is not
// handed the person `selection`. My profile sits after it: the board's own row,
// not part of the triage work, and likewise drawerless.
const TAB_KEYS = [
	"applications",
	"members",
	"guests",
	"insights",
	"profile",
] as const;
type TabKey = (typeof TAB_KEYS)[number];

/**
 * The board triage console: Applications / Members / Guests, and the drawer,
 * plus the board member's own My profile tab.
 *
 * Split out from {@link CommunityPage} so the roster subscriptions below are
 * only ever read by someone allowed to have them — this component is the `Can`
 * block's child, so a plain member never runs its body.
 */
function CommunityConsole() {
	const [params, setParams] = useSearchParams();
	// Free here: the same three queries are already subscribed for the whole
	// session up in the shell (see CommunityDataProvider), so reading them at
	// page level opens nothing new.
	const applications = useApplications();
	const members = useMembers();
	const guests = useGuests();

	/**
	 * The tab a person's row actually lives in.
	 *
	 * The link no longer has to know. It used to: global search built
	 * `?tab=members&person=…` by guessing from the roster it found someone in,
	 * which put the answer in the URL — where a tab switch, a stale link, or a
	 * person who has since been upgraded could all make it wrong, and a wrong
	 * tab means a drawer that opens on nobody.
	 */
	function tabOf(id: Id<"people">): TabKey | undefined {
		if ((applications.data() ?? []).some((r) => r._id === id))
			return "applications";
		if ((members.data() ?? []).some((r) => r._id === id)) return "members";
		if ((guests.data() ?? []).some((r) => r._id === id)) return "guests";
		return undefined;
	}

	/** True once every roster has answered, so "in none of them" is a fact
	 *  rather than "not yet". */
	function rostersReady(): boolean {
		return (
			applications.data() !== undefined &&
			members.data() !== undefined &&
			guests.data() !== undefined
		);
	}

	function isTabKey(value: unknown): value is TabKey {
		return (
			typeof value === "string" &&
			(TAB_KEYS as readonly string[]).includes(value)
		);
	}

	/** The tab a `?person=` link resolves to, when the URL names no tab. The
	 *  rosters are warm session-wide, so on an in-app palette jump this is
	 *  known on the very first render. The page mounts that tab directly
	 *  instead of building Applications and then switching. */
	function linkedTab(): TabKey | undefined {
		const person = params.person;
		if (typeof person !== "string") return undefined;
		return tabOf(person as Id<"people">);
	}

	/** A `?person=` link with no tab whose rosters have not answered yet:
	 *  mounting any panel now would guess, so hold a skeleton instead. */
	function awaitingLinkedTab(): boolean {
		return (
			typeof params.person === "string" &&
			!isTabKey(params.tab) &&
			!rostersReady()
		);
	}

	/**
	 * The tab actually on screen — which is not the same as `params.tab`.
	 * `Tabs.Root` falls back to `applications` for a value it does not
	 * recognise WITHOUT rewriting the URL, so `?tab=bogus` shows Applications
	 * while the param still says `bogus`.
	 */
	function activeTab(): TabKey {
		const value = params.tab;
		if (isTabKey(value)) return value;
		return linkedTab() ?? "applications";
	}

	/** Everyone on the three rosters, once ALL of them have answered. A partial
	 *  union would make the selection treat a person whose roster is still
	 *  loading as a dead link and drop `?person=`. */
	function people(): PersonRef[] | undefined {
		if (!rostersReady()) return undefined;
		return [
			...(applications.data() ?? []),
			...(members.data() ?? []),
			...(guests.data() ?? []),
		];
	}

	// Follow the person to the tab that holds them. Written straight to the URL
	// with `replace`, not through the tabs' own setter — that setter means "the
	// user picked a tab" and closes the drawer. Compared against the URL, not
	// `activeTab()`: `activeTab()` already resolves to the person's tab on first
	// render via `linkedTab()`, and skipping the write would leave `?tab=` unset,
	// so closing the drawer would fall back to Applications. Driven by the URL's
	// `?person=`, not by `selection.selectedId()`: the selection's local id lands
	// before the router commits `?person=`, and a tab write merged against that
	// stale URL drops the person, leaving the drawer open with nothing to close.
	//
	// Created BEFORE the selection, so it runs first. On a palette jump the page
	// mounts (it is code-split) after the router has settled, and the
	// selection's first effects put a paramless list entry behind the drawer
	// straight away. Writing `?tab=` first starts a navigation, the selection
	// waits for it to settle, and that entry keeps the person's tab: Back
	// closes the drawer onto their roster, not onto Applications.
	createEffect(() => {
		const home = linkedTab();
		if (home !== undefined && params.tab !== home)
			setParams({ tab: home }, { replace: true });
	});

	// One selection for all three rosters: `?person=` is page-wide, and a single
	// owner is what lets Back close the drawer (it owns the history entry the
	// open pushed) instead of leaving the page.
	const selection = createEntitySelection<PersonRef>({
		rows: people,
		param: "person",
	});

	return (
		<Tabs.Root
			class={styles.console}
			// Ark mounts every tab panel up front unless told otherwise, so
			// opening this page used to build the Applications, Members AND
			// Guests tables — several hundred rows of Ark widgets — before
			// showing anything. Panels now mount on first visit and stay
			// mounted (no `unmountOnExit`), so switching back is still instant.
			lazyMount
			urlParam={{
				get: () => activeTab(),
				set: (v) => {
					// Only ever called for a tab the USER picked (zag emits
					// `onValueChange` from its own events, never from a
					// controlled value change). A new tab is a new subject:
					// close whoever was open rather than hand a member's id to
					// the Guests table. Not popped: the tab write below is the
					// navigation, and a `navigate(-1)` would race it.
					selection.close(false);
					setParams({ tab: v, person: undefined });
				},
				fallback: "applications",
				keys: TAB_KEYS,
			}}
		>
			<div class={styles.tabBar}>
				<Tabs.List>
					<Tabs.Trigger value="applications">
						Applications
					</Tabs.Trigger>
					<Tabs.Trigger value="members">Members</Tabs.Trigger>
					<Tabs.Trigger value="guests">Guests</Tabs.Trigger>
					<Tabs.Trigger value="insights">Insights</Tabs.Trigger>
					<Tabs.Trigger value="profile">My profile</Tabs.Trigger>
				</Tabs.List>
				<ExportActions />
			</div>
			<Show when={!awaitingLinkedTab()} fallback={<TableSkeleton />}>
				<Tabs.Content value="applications" class={styles.panel}>
					<ApplicationsTab
						selection={selection}
						active={activeTab() === "applications"}
					/>
				</Tabs.Content>
				<Tabs.Content value="members" class={styles.panel}>
					<MembersTab
						selection={selection}
						active={activeTab() === "members"}
					/>
				</Tabs.Content>
				<Tabs.Content value="guests" class={styles.panel}>
					<GuestsTab
						selection={selection}
						active={activeTab() === "guests"}
					/>
				</Tabs.Content>
				<Tabs.Content value="insights" class={styles.panel}>
					<InsightsTab />
				</Tabs.Content>
				<Tabs.Content value="profile" class={styles.panel}>
					<MyProfile />
				</Tabs.Content>
			</Show>
		</Tabs.Root>
	);
}

/**
 * Community module page. Board sees the full triage console (Applications /
 * Members / Guests / Insights tabs, plus their own My profile); a plain member/guest sees only a read-only member
 * directory with no tab chrome. Driven by the CASL ability so the same layout
 * is reused, just with parts gated. Access itself is enforced upstream
 * (`AuthedGate`) and on the server (`requireRole`).
 */
export function CommunityPage() {
	return (
		<Can I="view" the="Applications" fallback={<MemberCommunity />}>
			<CommunityConsole />
		</Can>
	);
}
