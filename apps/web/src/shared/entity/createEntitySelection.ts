import {
	useIsRouting,
	useLocation,
	useNavigate,
	useSearchParams,
} from "@solidjs/router";
import { batch, createEffect, createSignal, on } from "solid-js";

/** Reserved param value for the create form. A row's slug is its `_id` (or a
 *  per-module override like `assetTag`), so `new` cannot collide with one. It
 *  lets the create drawer be URL-backed too, so the Back button closes it. */
const CREATE_SLUG = "new";

/** The value of `param` in the real browser URL, or `undefined` when there is
 *  no `window`, no real location, or the router is not window-bound (tests
 *  under MemoryRouter, whose URL lives in an in-memory history, not
 *  `window.location`). Gates the cold-inbound history synthesis to the browser. */
function paramInWindowUrl(param: string): string | undefined {
	if (typeof window === "undefined") return undefined;
	return new URLSearchParams(window.location.search).get(param) ?? undefined;
}

/**
 * Drawer open/close/URL selection, generalised from the proven EventsPage
 * behavior: a live id→row lookup (never the row snapshot), an inbound
 * `?param=` link that opens optimistically — before the rows list has
 * loaded, the drawer shows a skeleton until the row arrives, and only bails
 * once a LOADED list confirms the id is missing — and a close-on-vanish
 * guard.
 *
 * The URL search param is the single source of truth for open/closed, so the
 * system Back button closes the drawer instead of leaving the page. Opening
 * from closed PUSHES one history entry; stepping row→row REPLACES (never
 * stacks); closing pops the pushed entry so the URL, the Forward button and
 * Back all agree. A drawer reached by landing cold on a deep link has no entry
 * behind it, so it synthesizes a paramless base (in the browser) — Back returns
 * to the list rather than leaving the app.
 */
export function createEntitySelection<Row extends { _id: string }>(opts: {
	rows: () => Row[] | undefined;
	param: string;
	/** Inbound links only open / outbound writes only happen when true. Tabbed
	 *  pages pass `activeTab() === myTab`; single-table pages omit (defaults
	 *  true). */
	active?: () => boolean;
	/** Tabbed pages: called with an inbound slug that belongs to another tab so
	 *  the page can switch the active tab first (side effect; returns void).
	 *  The hook re-checks `active()` next tick and opens once this tab is on
	 *  screen. */
	onNeedTab?: (slug: string) => void;
	/** How a row is identified in the URL — `slugOf(desc, row)`. Default
	 *  `_id`. */
	slugOf?: (row: Row) => string;
}): {
	selected: () => Row | undefined;
	selectedId: () => string | undefined; // the slug, actually
	open: () => boolean;
	/** True while the drawer is open for a real row (a slug is selected) whose
	 *  data hasn't arrived from the list yet — distinct from create mode,
	 *  which has no slug at all. Drives each drawer's `loading` prop. */
	loading: () => boolean;
	/** True while the drawer is open in create mode (no slug selected). */
	creating: () => boolean;
	openRow: (row: Row) => void;
	openCreate: () => void;
	close: (pop?: boolean) => void;
} {
	const [params, setParams] = useSearchParams();
	const navigate = useNavigate();
	const slugOf = opts.slugOf ?? ((row: Row) => row._id);
	function isActive(): boolean {
		return opts.active?.() ?? true;
	}

	// The slug, not the row: looked up live each render so an edit made in the
	// drawer (or a fresher server copy) shows immediately instead of freezing
	// on the snapshot taken when it opened.
	const [selectedId, setSelectedId] = createSignal<string>();
	const [open, setOpen] = createSignal(false);

	// Whether the current open drawer owns a history entry this hook pushed.
	// When true, `close()` pops that entry (matching the Back button); when
	// false — the drawer was opened by landing on a deep link — `close()` just
	// clears the param, never navigating out of the app. Not reactive: it
	// gates a navigation choice, it does not drive rendering.
	let ownsEntry = false;

	function selected(): Row | undefined {
		const id = selectedId();
		return id === undefined || id === CREATE_SLUG
			? undefined
			: opts.rows()?.find((row) => slugOf(row) === id);
	}

	function loading(): boolean {
		return selectedId() !== undefined && selected() === undefined;
	}

	function creating(): boolean {
		return open() && selectedId() === undefined;
	}

	// Clear only local state — never touches history. The single close
	// finaliser, reached both by the system Back button (which pops the param)
	// and by `close()`'s `navigate(-1)` (which pops it too). Navigating here
	// would recurse, so it must not.
	function resetLocal(): void {
		batch(() => {
			setOpen(false);
			setSelectedId(undefined);
		});
		ownsEntry = false;
	}

	// The param is the truth. Inbound: a `?param=<slug>` link (command palette
	// or shared URL) opens that row optimistically, before the rows list has
	// resolved — the drawer shows a skeleton (via `selected()` staying
	// undefined) rather than waiting; only a LOADED list that lacks the id
	// bails (a genuine dead link, not a still-loading one). Outbound: when the
	// param goes empty while the drawer is open (Back button, or `close()`
	// popping its entry), finalise the close here.
	//
	// Tracked deps are the param, the rows and `active` — NOT `selectedId`.
	// `setParams` navigates via solid-router's `startTransition`, so the URL
	// param lags a tick behind a same-batch local write; tracking `selectedId`
	// would re-fire this effect on a stale value. Reading `selectedId()`
	// untracked inside the callback still gates re-opens without being a
	// re-trigger source.
	createEffect(
		on(
			[() => params[opts.param], opts.rows, isActive],
			([wanted, rows, active]) => {
				if (typeof wanted !== "string" || wanted === "") {
					// Param gone while open → closed by Back or by close(). Do
					// not navigate here (that would recurse); just reset. The
					// synth-base effect below bypasses the router, so its
					// paramless write never reaches here.
					if (open()) resetLocal();
					return;
				}
				if (selectedId() === wanted) return;
				if (!active) {
					opts.onNeedTab?.(wanted);
					return;
				}
				// Open optimistically while the list is still loading — the
				// drawer shows a skeleton (`selected()` stays undefined) rather
				// than waiting. Only bail when a LOADED list lacks the id: that
				// is a dead link, not a still-loading one.
				if (wanted !== CREATE_SLUG) {
					if (
						rows !== undefined &&
						!rows.some((row) => slugOf(row) === wanted)
					) {
						// A dead deep-link: the list has loaded and confirms the
						// slug doesn't exist (as opposed to still loading, which is
						// the optimistic-open path above). Clear the stale param in
						// place so the URL doesn't keep pointing at a missing row
						// with no drawer and no further effect run. `wanted` came
						// from `params[opts.param]`, so it is already set here; the
						// guard just avoids a redundant write.
						if (params[opts.param] !== undefined) {
							setParams(
								{ [opts.param]: undefined },
								{ replace: true }
							);
						}
						return;
					}
				}
				if (wanted === CREATE_SLUG) {
					batch(() => {
						setSelectedId(undefined);
						setOpen(true);
					});
					return;
				}
				batch(() => {
					setSelectedId(wanted);
					setOpen(true);
				});
			}
		)
	);

	// Cold inbound (a deep/shared link or a command-palette nav) lands with the
	// param already set, on an entry this hook did not push. There is no
	// paramless entry behind it, so the system Back button would leave the
	// page (in a PWA, the app) instead of closing the drawer. Synthesize a base
	// so Back returns to the list.
	//
	// Only once the router has settled: solid-router commits a navigation to
	// `window.history` AFTER its transition, so while it is routing the window
	// URL is still the previous page. Synthesizing then found no param there,
	// skipped, and a palette pick from another page left Back pointing at that
	// page.
	//
	// This must NOT go through the router: `setParams` emits a location change,
	// and the intermediate paramless value would trip the close finaliser
	// (empty param). Rewrite the history stack directly instead — replace the
	// current entry with the paramless URL, then push the param back. The net
	// URL is unchanged, so solid-router (which only reacts to `popstate` and its
	// own `navigate`) never sees it. A real Back fires `popstate` → the router
	// reads the paramless base → the finaliser closes the drawer. (`_depth` in
	// `history.state` is solid-router's back/forward bookkeeping; the app
	// registers no `useBeforeLeave`, so carrying the existing state through is
	// enough.) When the router is not window-bound (tests under MemoryRouter,
	// SSR) the window URL never carries the param, so nothing is synthesized
	// and close() clears the param in place.
	//
	// A pick made while already on this list (no drawer open) needs no base:
	// the router pushed the param entry right on top of the list entry. Claim
	// that entry instead, or Back would close the drawer and then stall on a
	// second copy of the list.
	const isRouting = useIsRouting();
	const location = useLocation();
	// The location the param last changed FROM. Only a change of this
	// selection's own param moves it: a page that rewrites another param while
	// the drawer opens (Community puts the person's `?tab=` in the URL right
	// after `?person=` lands) must not make the list it came from look like
	// some other page.
	let previous: { pathname: string; search: string } | undefined;
	createEffect(
		on(
			() => ({
				pathname: location.pathname,
				search: location.search,
				value: params[opts.param],
			}),
			(now, before) => {
				if (before !== undefined && now.value !== before.value)
					previous = {
						pathname: before.pathname,
						search: before.search,
					};
			},
			{ defer: true }
		)
	);
	// This assumes the param arrived by a router PUSH on top of the list entry.
	// A same-path write that sets the param with `replace: true` must not rely on
	// it: the hook would claim an entry it did not push.
	function cameFromThisList(): boolean {
		return (
			previous?.pathname === location.pathname &&
			!new URLSearchParams(previous.search).has(opts.param)
		);
	}
	createEffect(() => {
		const wanted = params[opts.param];
		if (isRouting() || !open() || ownsEntry || !isActive()) return;
		if (typeof wanted !== "string" || wanted === "") return;
		if (paramInWindowUrl(opts.param) !== wanted) return;
		if (cameFromThisList()) {
			ownsEntry = true;
			return;
		}
		const state: unknown = window.history.state;
		const url = new URL(window.location.href);
		url.searchParams.delete(opts.param);
		window.history.replaceState(state, "", url);
		url.searchParams.set(opts.param, wanted);
		window.history.pushState(state, "", url);
		// We now own the pushed param entry; close() pops it.
		ownsEntry = true;
	});

	// Close the drawer if the open row vanishes from a loaded list (deleted
	// here or by someone else) rather than falling back to create mode.
	createEffect(() => {
		const rows = opts.rows();
		const id = selectedId();
		if (
			id !== undefined &&
			id !== CREATE_SLUG &&
			rows !== undefined &&
			!rows.some((row) => slugOf(row) === id)
		) {
			// In place, no history traversal: the row vanished (often a remote
			// delete), which is not the user navigating.
			close(false);
		}
	});

	// Open-from-closed pushes exactly one history entry the Back button can pop;
	// stepping to another row while already open replaces it, so a browse
	// session never stacks `?param=` states. No-op when the selection is not
	// active (a background tab must not write the URL).
	function writeParam(value: string): void {
		if (!isActive()) return;
		if (open()) {
			setParams({ [opts.param]: value }, { replace: true });
		} else {
			setParams({ [opts.param]: value }, { replace: false });
			ownsEntry = true;
		}
	}

	// `pop` (default true) is the user dismissing the drawer itself — Escape,
	// backdrop, the close button — which pops the entry the open pushed so the
	// history stack stays clean. Pass `pop: false` for a programmatic close
	// that is part of a DIFFERENT navigation already in flight — a tab switch
	// writes the new tab URL right after closing its drawers, and a
	// `navigate(-1)` there would traverse history mid-switch and race that
	// write, landing back on the old tab. A non-pop close just clears local
	// state and the param in place.
	function close(pop = true): void {
		if (!open()) return;
		if (pop && ownsEntry && isActive()) {
			// Pop the entry this hook pushed. The param effect above finalises
			// local state once the param clears; the Forward button can bring
			// the drawer back.
			navigate(-1);
			return;
		}
		// Either we own no entry (opened by landing on a deep link), or this is
		// a non-pop programmatic close. Clear local state, and the param in
		// place — but only while this selection still owns the URL (an inactive
		// tab must not stomp another tab's param). Never navigate out of the app.
		batch(() => {
			setOpen(false);
			setSelectedId(undefined);
			if (isActive()) {
				setParams({ [opts.param]: undefined }, { replace: true });
			}
		});
		ownsEntry = false;
	}

	function openCreate(): void {
		// URL-linked via the `new` sentinel so Back closes it. `selectedId`
		// stays undefined → `selected()` is undefined → the create form renders.
		writeParam(CREATE_SLUG);
		batch(() => {
			setSelectedId(undefined);
			setOpen(true);
		});
	}

	function openRow(row: Row): void {
		const slug = slugOf(row);
		// `writeParam` reads `open()` to choose push vs replace, so call it
		// before flipping `open` true.
		writeParam(slug);
		batch(() => {
			setSelectedId(slug);
			setOpen(true);
		});
	}

	return {
		selected,
		selectedId,
		open,
		loading,
		creating,
		openRow,
		openCreate,
		close,
	};
}

/** What a page hands the tab (or tabs) its selection drives. Derived from the
 *  hook itself so the shape can never drift from it. */
export type EntitySelection<Row extends { _id: string }> = ReturnType<
	typeof createEntitySelection<Row>
>;
