import { Dialog } from "@ark-ui/solid";
import {
	createContext,
	createSignal,
	Index,
	onCleanup,
	onMount,
	Show,
	untrack,
	useContext,
} from "solid-js";
import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { Deferred } from "../Deferred/Deferred.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";
import { Skeleton } from "../Skeleton/Skeleton.tsx";

import styles from "./Drawer.module.scss";

/** Lets a deferred `Body` tell `Root` its children just mounted, so Root can
 *  hand focus to `initialFocusEl`. That element did not exist when Ark ran its
 *  own initial focus, because the body was still a skeleton then. */
const BodyReady = createContext<() => void>(() => undefined);

/**
 * Right-side slide-in panel built directly on Ark Dialog (the design-system
 * Dialog centers a modal card; a drawer needs the positioner pinned right and a
 * full-height content panel). Controlled via `open` / `onOpenChange`.
 *
 * A compound like the rest of the design system (`Table.Root`, `Accordion.*`):
 * `Drawer.Root` owns the overlay, focus and stacking; the consumer composes the
 * chrome from `Drawer.Header` / `Drawer.Title` / `Drawer.HeaderActions` /
 * `Drawer.Close` / `Drawer.Body` / `Drawer.Footer`. Every part renders inside
 * `Root`'s Dialog, so `Title` and `Close` reach the Ark dialog context they need.
 */
function Root(props: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Element to focus when the drawer opens (e.g. a title field). Defaults to
	 *  the content panel itself. */
	initialFocusEl?: () => HTMLElement | null;
	children: JSX.Element;
}): JSX.Element {
	/**
	 * Ark syncs a controlled `open` through a zag `track`, which is a
	 * `createEffect` whose FIRST run only records its dependencies. So a drawer
	 * that mounts shut and is opened before that first run presents zag with no
	 * transition to act on: the machine's initial state was computed as
	 * "closed", the track run reads `true` and records it without firing, and
	 * the panel stays shut with `open` permanently true. No error, no callback
	 * — it simply never appears.
	 *
	 * That is not hypothetical. Following a `?person=` link from another page
	 * mounts the console, switches tab and opens the drawer in one flush; the
	 * drawer never showed, while reloading the very same URL worked, because
	 * waiting on the roster put a real gap between the mount and the open.
	 *
	 * A drawer that is ALREADY open when it mounts is fine — zag computes its
	 * initial state from `open` and starts open — so only the shut-at-mount
	 * case waits, and only until the end of the current task, by which point
	 * the track effect has run and recorded `false`.
	 */
	const openAtMount = untrack(() => props.open);
	const [settled, setSettled] = createSignal(false);
	/**
	 * The panel focuses ITSELF when it opens, not the first thing inside it.
	 *
	 * Ark's focus trap otherwise moves focus to the first tabbable descendant,
	 * which here is the first `HeaderActions` control — the community drawers put
	 * the edit-lock `IconButton` there, so opening a drawer parked focus on the
	 * padlock, and, because that button carries a tooltip that opens on focus, it
	 * flashed a stray, mis-positioned hint too. Focusing the content (it is
	 * `tabindex="-1"` and labelled by the title) announces the drawer instead, and
	 * leaves the drawer's own arrow/letter shortcuts to act from a neutral spot.
	 *
	 * An explicit `initialFocusEl` (to drop the caret in a field, say) still wins.
	 */
	let contentEl: HTMLElement | null = null;
	onMount(() => {
		const timer = setTimeout(() => {
			setSettled(true);
		}, 0);
		onCleanup(() => {
			clearTimeout(timer);
		});
	});
	function open(): boolean {
		return props.open && (openAtMount || settled());
	}
	/** A deferred `Body`'s children mounted after Ark's own initial focus ran
	 *  against a skeleton. Re-apply `initialFocusEl` now that the real target
	 *  exists — but only if focus is still where Ark parked it (the content
	 *  panel), so a person who has since tabbed or clicked elsewhere isn't
	 *  yanked back. */
	function onBodyReady(): void {
		const target = props.initialFocusEl?.();
		if (target && document.activeElement === contentEl) target.focus();
	}
	return (
		<BodyReady.Provider value={onBodyReady}>
			<Dialog.Root
				open={open()}
				onOpenChange={(d) => {
					props.onOpenChange(d.open);
				}}
				// A deferred `Body` means an `initialFocusEl` target (a field inside
				// it) may not exist yet when Ark runs this on mount — `()=>null`
				// makes Ark's focus-trap throw internally (it treats `null`, unlike
				// `undefined`, as "specified but invalid") and land nowhere. Falling
				// back to `contentEl` per call keeps Ark's own initial focus on the
				// panel in that case, which `onBodyReady` below checks for before
				// re-applying the real target once it mounts.
				initialFocusEl={() => props.initialFocusEl?.() ?? contentEl}
				// Content builds on first open. No `unmountOnExit`: the close is a CSS
				// transition, which unmounting would cut off.
				lazyMount
			>
				<Portal>
					<Dialog.Backdrop class={styles.backdrop} />
					<Dialog.Positioner class={styles.positioner}>
						<Dialog.Content
							class={styles.content}
							// A drawer is a detail panel, not a confirmation: bare-letter
							// shortcuts and nav arrows are meant to act on the thing it shows
							// while focus rests in it. This opts the panel out of
							// `isTypingTarget`'s "an open dialog claims its keystrokes" rule, so
							// those shortcuts fire; real inputs inside it are still caught, so
							// typing a field never triggers one.
							data-shortcut-surface="true"
							ref={(el: HTMLElement) => {
								contentEl = el;
							}}
						>
							{props.children}
						</Dialog.Content>
					</Dialog.Positioner>
				</Portal>
			</Dialog.Root>
		</BodyReady.Provider>
	);
}

/** The header row: put a {@link Title} and a {@link HeaderActions} inside it. */
function Header(props: { children: JSX.Element }): JSX.Element {
	return <header class={styles.header}>{props.children}</header>;
}

/** The drawer's accessible name — labels the content panel via Ark's dialog.
 *  `loading` swaps the text for a shimmer while the row it names has not
 *  arrived. */
function Title(props: {
	children: JSX.Element;
	loading?: boolean;
}): JSX.Element {
	return (
		<Dialog.Title class={styles.title}>
			<Show
				when={!props.loading}
				fallback={
					<>
						<Skeleton class={styles.titleSkeleton} />
						{/* The skeleton bar is aria-hidden, so without this the
						    dialog's aria-labelledby (this Title) resolves to "" while
						    loading — the dialog has no accessible name. */}
						<span class={styles.srOnly}>Loading</span>
					</>
				}
			>
				{props.children}
			</Show>
		</Dialog.Title>
	);
}

/** The cluster of controls at the header's trailing edge — nav, edit toggle,
 *  and the {@link Close} button. */
function HeaderActions(props: { children: JSX.Element }): JSX.Element {
	return <div class={styles.headerActions}>{props.children}</div>;
}

/** Generic manual-mode fallback: label/value placeholder bars in the
 *  `PropertyRow` rhythm, used when a surface hasn't given `Body` a shaped
 *  `skeleton` of its own. `data-drawer-skeleton` is the variant-agnostic
 *  "a skeleton is showing" hook (also present on the measured variant below);
 *  `data-drawer-skeleton-row` marks each generic bar-pair specifically. */
function BodySkeleton(props: { rows?: number }): JSX.Element {
	return (
		<div
			class={styles.bodySkeleton}
			role="status"
			aria-label="Loading"
			data-drawer-skeleton=""
		>
			<Index each={Array.from({ length: props.rows ?? 6 })}>
				{(_, i) => (
					<div
						class={styles.bodySkeletonRow}
						data-drawer-skeleton-row=""
					>
						<Skeleton width="short" />
						<Skeleton width={i % 2 === 0 ? "long" : "medium"} />
					</div>
				)}
			</Index>
		</div>
	);
}

/**
 * The scrolling body. Always skeleton-first: the drawer shell paints at once
 * with a skeleton, and the children build after that paint. A person
 * drawer's body is a few hundred milliseconds of work, and without this the
 * click froze with no feedback. `loading` holds the skeleton while the row
 * itself has not arrived.
 *
 * Two skeleton variants, picked by whether `skeleton` is passed:
 *
 * - **No `skeleton`** (default): generic manual-mode bars, `BodySkeleton`
 *   above. Cheapest to reach for — most bodies don't bother shaping their
 *   placeholder.
 * - **`skeleton` passed**: the surface's own placeholder markup (literal
 *   "placeholder" text, lightweight components only — no queries, tooltips
 *   or inputs), rendered through `Skeleton`'s MEASURED mode: it mounts
 *   hidden, its leaf boxes are measured in `onMount` (before the browser
 *   paints, so nothing flashes unmeasured), and a shimmer overlay tracks
 *   those boxes. Measuring is safe here specifically BECAUSE a placeholder
 *   tree is cheap to build — measuring it costs nothing a manual bar
 *   wouldn't. Write it inline at the call site
 *   (`skeleton={<TaskFieldsPlaceholder />}`), never hoisted to a shared
 *   variable reused across drawers: a Solid JSX element is already-built
 *   DOM, produced fresh each time the expression evaluates, and the same
 *   node can't sit in two parents' trees at once.
 *
 * Both variants carry `role="status" aria-label="Loading"` and
 * `data-drawer-skeleton` so a test (or a11y tooling) can assert "a skeleton
 * is showing" without caring which variant is in play.
 */
function Body(props: {
	children: JSX.Element;
	loading?: boolean;
	skeleton?: JSX.Element;
}): JSX.Element {
	const ready = useContext(BodyReady);
	function Mounted(p: { children: JSX.Element }): JSX.Element {
		onMount(ready);
		return <>{p.children}</>;
	}
	function fallback(): JSX.Element {
		// Read once: at the call site `skeleton` compiles to a getter that
		// rebuilds the placeholder on every read, so a second read would build
		// a whole tree (Accordion machine included) only to throw it away.
		const skeleton = props.skeleton;
		return skeleton ? (
			<div
				class={styles.bodySkeleton}
				role="status"
				aria-label="Loading"
				data-drawer-skeleton=""
			>
				<Skeleton visible>{skeleton}</Skeleton>
			</div>
		) : (
			<BodySkeleton />
		);
	}
	return (
		<div class={styles.body}>
			<Deferred hold={props.loading} fallback={fallback()}>
				<Mounted>{props.children}</Mounted>
			</Deferred>
		</div>
	);
}

/** The pinned footer, for decision buttons. Rendered only when the consumer
 *  includes it. */
function Footer(props: { children: JSX.Element }): JSX.Element {
	return <footer class={styles.footer}>{props.children}</footer>;
}

/** The close affordance. `shortcut="Escape"` is the hint only — Ark's dialog
 *  closes on Escape itself, so this registers no key; it just shows the ⎋ chip
 *  in the tooltip and as a peek badge, so the close control says which key does
 *  it. */
function Close(): JSX.Element {
	return (
		<Dialog.CloseTrigger
			asChild={(p) => (
				<IconButton
					{...(p() as object)}
					tooltipLabel="Close"
					shortcut="Escape"
				>
					{ICONS.close}
				</IconButton>
			)}
		/>
	);
}

export const Drawer = {
	Root,
	Header,
	Title,
	HeaderActions,
	Body,
	Footer,
	Close,
};
