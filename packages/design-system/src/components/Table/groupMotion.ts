/**
 * A group's collapse or expand, as a View Transition through the
 * coordinator (utils/viewTransition.ts). Before the toggle every row and
 * group header on screen takes a name of the table-row family; after it,
 * the new state's on-screen rows take theirs. A row on both sides glides to
 * its new place; a collapsing group's rows (old side only) slide up under
 * their header as they fade, an expanding group's (new side only) slide
 * down out from under it (styles/viewTransition.scss). The coordinator
 * clears the names when the transition finishes.
 *
 * Instant, as before, while another transition runs (a morph's animation
 * would be cut short), under reduced motion, without the API, or with no
 * row on screen.
 */
import { MORPH_OF, TABLE_ROW_CLIP_VAR } from "../../utils/morphNames.ts";
import {
	type TransitionName,
	activeTransition,
	canAnimate,
	tableGroupName,
	tableRowName,
	viewTransition,
} from "../../utils/viewTransition.ts";
import { visibleRect } from "../../utils/visibleArea.ts";

/** A group header row, carrying its group's key. */
export const GROUP_KEY_ATTR = "data-group-key";

/** Sub-pixel slack: a row this close to fully on screen counts as fully. */
const VISIBLE_SLACK_PX = 1;

/** How far inside a row's visible edges its cover is probed. */
const PROBE_INSET_PX = 1;

type Named = [HTMLElement, TransitionName];

function nameOf(row: HTMLElement): TransitionName | undefined {
	const id = row.getAttribute(MORPH_OF);
	if (id !== null) return tableRowName(id);
	const key = row.getAttribute(GROUP_KEY_ATTR);
	return key === null ? undefined : tableGroupName(key);
}

/** All of the row's height is on screen (its width may be cut by the
 *  table's sideways scroll, which the clip var handles). A snapshot ignores
 *  its ancestors' clipping, so a row half scrolled out of its box would
 *  paint outside it. */
function isOnScreen(row: HTMLElement): boolean {
	const box = row.getBoundingClientRect();
	return visibleRect(row).height >= box.height - VISIBLE_SLACK_PX;
}

/** Nothing sits over the row: a snapshot paints above the whole page, so a
 *  row under the sticky head, an app bar or a floating bar would show
 *  through it. Probed at the visible part's corners and centre. */
function isUncovered(row: HTMLElement): boolean {
	if (typeof document.elementFromPoint !== "function") return true;
	const visible = visibleRect(row);
	const xs = [
		visible.left + PROBE_INSET_PX,
		visible.left + visible.width / 2,
		visible.right - PROBE_INSET_PX,
	];
	const ys = [visible.top + PROBE_INSET_PX, visible.bottom - PROBE_INSET_PX];
	return xs.every((x) =>
		ys.every((y) => {
			const hit = document.elementFromPoint(x, y);
			return hit === null || row.contains(hit);
		})
	);
}

/** The body's rows and group headers that have a name and are on screen. */
function* namedRowsOnScreen(body: HTMLElement): Generator<Named> {
	for (const row of body.querySelectorAll<HTMLElement>(":scope > tr")) {
		const name = nameOf(row);
		if (name && isOnScreen(row)) yield [row, name];
	}
}

/** The old state: the body's rows and group headers on screen and
 *  uncovered, named, and the ones on screen but covered. */
function oldState(body: HTMLElement): {
	named: Named[];
	covered: Set<HTMLElement>;
} {
	const named: Named[] = [];
	const covered = new Set<HTMLElement>();
	for (const entry of namedRowsOnScreen(body)) {
		if (isUncovered(entry[0])) named.push(entry);
		else covered.add(entry[0]);
	}
	return { named, covered };
}

/**
 * The new state: the body's rows and group headers on screen, named, but for
 * those covered in the old state. Hit testing finds only `<html>` while a
 * transition's update runs, so covers are not probed again. A toggle moves
 * no row under the sticky head or an app bar: the rows above the clicked
 * header stay put, the rest stay below it.
 */
function newState(body: HTMLElement, covered: Set<HTMLElement>): Named[] {
	return [...namedRowsOnScreen(body)].filter(([row]) => !covered.has(row));
}

/** The inset cutting a row's snapshot to the table's visible width. Every
 *  row of one table spans the same width, so one value serves them all. */
function sideClip(row: HTMLElement): string {
	const box = row.getBoundingClientRect();
	const visible = visibleRect(row);
	const left = Math.max(0, visible.left - box.left);
	const right = Math.max(0, box.right - visible.right);
	return `inset(0px ${String(right)}px 0px ${String(left)}px)`;
}

/**
 * Runs `toggle` (one group's collapse when `isCollapsing`, else its expand)
 * as a transition of the rows of `body`, the table's `<tbody>`.
 */
export function toggleGroupWithMotion(
	body: HTMLElement | null,
	isCollapsing: boolean,
	toggle: () => void
): void {
	if (!body || !canAnimate() || activeTransition() !== undefined) {
		toggle();
		return;
	}
	const { named: before, covered } = oldState(body);
	const first = before.at(0);
	if (!first) {
		toggle();
		return;
	}
	const root = document.documentElement;
	const clip = sideClip(first[0]);
	// Read only by the snapshots' rules, so the page paints nothing new
	// before the old snapshot.
	root.style.setProperty(TABLE_ROW_CLIP_VAR, clip);
	void viewTransition(
		(scope) => {
			// The new state names what is on screen then; a row that was
			// but no longer is leaves as an old-side-only row.
			for (const [row] of before) scope.unname(row);
			toggle();
			scope.beforeSnapshot(() => {
				for (const [row, name] of newState(body, covered)) {
					scope.name(row, name);
				}
			});
		},
		{
			kind: isCollapsing ? "table-collapse" : "table-expand",
			names: before,
		}
	).then(() => {
		if (root.style.getPropertyValue(TABLE_ROW_CLIP_VAR) === clip) {
			root.style.removeProperty(TABLE_ROW_CLIP_VAR);
		}
	});
}
