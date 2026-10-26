import type { AppAbility, Permission } from "../../lib/ability.tsx";

/**
 * The app's user-facing version and its changelog, newest entry first.
 *
 * `APP_VERSION` is derived from the top entry, so shipping a release is one edit:
 * prepend an entry. {@link WhatsNew} shows everything newer than the version a
 * person last acknowledged — so a user who skips a release still sees its notes
 * folded into the next dialog. Only features belong here, not improvements.
 */
export type ChangeItem = {
	text: string;
	/** The ability a viewer needs to see this item; none means everyone. */
	audience?: Permission;
};

export type ChangeEntry = {
	version: string;
	title: string;
	items: ChangeItem[];
};

/** Who may edit the space's Wi-Fi and read its door log: the board. */
const SPACE_MANAGERS = { action: "manage", subject: "Space" } as const;
/** Who may manage the roster, including a person's data: the board. */
const ROSTER_MANAGERS = { action: "manage", subject: "Members" } as const;
/** Who sees the board's triage console and its insights. */
const CONSOLE_VIEWERS = { action: "view", subject: "Applications" } as const;
/** Who sees the bell and the notifications sheet: every community tier. */
const NOTIFICATION_VIEWERS = {
	action: "view",
	subject: "Notifications",
} as const;
/** Who sees the Events module: every community tier. */
const EVENT_VIEWERS = { action: "view", subject: "Events" } as const;
/** Who sees the space's Wi-Fi and house rules: every community tier. */
const SPACE_INFO_VIEWERS = { action: "view", subject: "SpaceInfo" } as const;
/** Who can open a person's signed agreement from the rosters: the board. */
const AGREEMENT_VIEWERS = { action: "view", subject: "Members" } as const;
/** Who sees the Inventory module: the board. */
const INVENTORY_VIEWERS = { action: "view", subject: "Inventory" } as const;

export const CHANGELOG: ChangeEntry[] = [
	{
		version: "1.3",
		title: "Doors, notifications & the phone app",
		items: [
			{
				text: "Open the doors from the app, and see when the upstairs door is already unlocked.",
			},
			{ text: "Install J floor on your phone as an app." },
			{
				text: "Notifications on your phone, with email as a fallback. Switch them on or off per device, and find past notifications under the bell.",
				audience: NOTIFICATION_VIEWERS,
			},
			{
				text: "House rules are searchable.",
				audience: SPACE_INFO_VIEWERS,
			},
			{
				text: "Events now have a start and an end time.",
				audience: EVENT_VIEWERS,
			},
			{ text: "A My profile tab.", audience: ROSTER_MANAGERS },
			{
				text: "Door history per person, and the whole door log, in Space.",
				audience: SPACE_MANAGERS,
			},
			{
				text: "Attendance in Community Insights, and an email when the people counter goes offline.",
				audience: CONSOLE_VIEWERS,
			},
			{
				text: "Print the inventory list on letterhead.",
				audience: INVENTORY_VIEWERS,
			},
			{
				text: "Print signed agreements on letterhead.",
				audience: AGREEMENT_VIEWERS,
			},
			{ text: "Edit the Wi-Fi details.", audience: SPACE_MANAGERS },
			{
				text: "Export or erase a person's data on request.",
				audience: ROSTER_MANAGERS,
			},
			{ text: "A staff role.", audience: ROSTER_MANAGERS },
		],
	},
	{
		version: "1.2",
		title: "Events, visitors & inventory",
		items: [
			{
				text: "Events: create an event, then share a QR or link — visitors register themselves in seconds, and you can see who's coming.",
				audience: EVENT_VIEWERS,
			},
			{
				text: "Visitor sign-in: guests enter their name and email, confirm by email, and get the Wi-Fi — no account, just that one page.",
			},
			{
				text: "One Wi-Fi network — “J floor” — shown right in the space.",
				audience: SPACE_INFO_VIEWERS,
			},
			{
				text: "Inventory (board & admin): track gear by item, type and category, with a scannable QR on every item.",
				audience: INVENTORY_VIEWERS,
			},
			{
				text: "Search everything: the command palette now finds people, tasks, events and inventory items — press Enter to open any of them.",
			},
			{
				text: "Shareable links: opening an event, task, project or inventory item puts it in the URL, so you can send someone straight to it.",
			},
		],
	},
	{
		version: "1.1",
		title: "Keyboard-first triage",
		items: [
			{
				text: "Keyboard shortcut: hold Alt to see all the keybindings for instant productivity.",
			},
			{
				text: "New Community Insights tab — the health of the whole roster at a glance.",
				audience: CONSOLE_VIEWERS,
			},
			{
				text: "Board notes are an attributed thread now — who wrote what, and when.",
				audience: CONSOLE_VIEWERS,
			},
			{
				text: 'Richer rosters: venture details on every tab and a working "hosted by" filter.',
				audience: CONSOLE_VIEWERS,
			},
		],
	},
];

/** The current version — the newest changelog entry. */
export const APP_VERSION = CHANGELOG[0].version;

/**
 * Whether `version` is strictly newer than the last-seen one. A `null` seen
 * (never acknowledged) counts everything as new. Compared field by field as
 * integers so "1.10" beats "1.9".
 */
export function isNewer(version: string, seen: string | null): boolean {
	if (seen === null) return true;
	const versionParts = version.split(".").map(Number);
	const seenParts = seen.split(".").map(Number);
	for (
		let index = 0;
		index < Math.max(versionParts.length, seenParts.length);
		index++
	) {
		const versionPart = versionParts[index] ?? 0;
		const seenPart = seenParts[index] ?? 0;
		if (versionPart !== seenPart) return versionPart > seenPart;
	}
	return false;
}

/**
 * The notes a viewer should see: versions newer than `seen`, each with only
 * the items `ability` allows, and versions left with no item dropped.
 */
export function visibleNotes(
	entries: ChangeEntry[],
	seen: string | null,
	ability: AppAbility
): ChangeEntry[] {
	return entries
		.filter((entry) => isNewer(entry.version, seen))
		.map((entry) => ({
			...entry,
			items: entry.items.filter(
				(item) =>
					!item.audience ||
					ability.can(item.audience.action, item.audience.subject)
			),
		}))
		.filter((entry) => entry.items.length > 0);
}
