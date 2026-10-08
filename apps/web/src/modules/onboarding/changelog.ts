/**
 * The app's user-facing version and its changelog, newest entry first.
 *
 * `APP_VERSION` is derived from the top entry, so shipping a release is one edit:
 * prepend an entry. {@link WhatsNew} shows everything newer than the version a
 * person last acknowledged — so a user who skips a release still sees its notes
 * folded into the next dialog.
 */
export type ChangeEntry = {
	version: string;
	title: string;
	items: string[];
};

export const CHANGELOG: ChangeEntry[] = [
	{
		version: "1.2",
		title: "Events, visitors & inventory",
		items: [
			"Events: create an event, then share a QR or link — visitors register themselves in seconds, and you can see who's coming.",
			"Visitor sign-in: guests enter their name and email, confirm by email, and get the Wi-Fi — no account, just that one page.",
			"One Wi-Fi network — “J floor” — shown right in the space.",
			"Inventory (board & admin): track gear by item, type and category, with a scannable QR on every item.",
			"Search everything: the command palette now finds people, tasks, events and inventory items — press Enter to open any of them.",
			"Shareable links: opening an event, task, project or inventory item puts it in the URL, so you can send someone straight to it.",
		],
	},
	{
		version: "1.1",
		title: "Keyboard-first triage",
		items: [
			"Keyboard shortcut: hold Alt to see all the keybindings for instant productivity.",
			"New Community Insights tab — the health of the whole roster at a glance.",
			"Board notes are an attributed thread now — who wrote what, and when.",
			'Richer rosters: venture details on every tab and a working "hosted by" filter.',
			"Fixes: the command palette no longer steals focus on load, and dialogs no longer open behind the drawer.",
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
	const a = version.split(".").map(Number);
	const b = seen.split(".").map(Number);
	for (let i = 0; i < Math.max(a.length, b.length); i++) {
		const x = a[i] ?? 0;
		const y = b[i] ?? 0;
		if (x !== y) return x > y;
	}
	return false;
}
