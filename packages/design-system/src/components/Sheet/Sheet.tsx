import { Dialog, type DialogRootProps } from "@ark-ui/solid/dialog";
import {
	createContext,
	createMemo,
	createSignal,
	Index,
	onCleanup,
	onMount,
	Show,
	untrack,
} from "solid-js";
import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { useRequiredContext } from "../../utils/context.ts";
import { MORPH_SCRIM } from "../../utils/morph.ts";
import { MORPH_TITLE, SHEET_SKELETON } from "../../utils/morphPairing.ts";
import {
	type MorphOverlayProps,
	createMorphPresence,
	overlayMorphOptions,
} from "../../utils/morphPresence.ts";
import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import { createSlotPart } from "../../utils/presence.tsx";
import { Deferred } from "../Deferred/Deferred.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";
import { Skeleton } from "../Skeleton/Skeleton.tsx";

import styles from "./Sheet.module.scss";

/** Marks the sheet's scrolling body; SheetNav slides it on prev/next. */
export const SHEET_BODY = "data-sheet-body";

/** What `Root` shares with its parts. */
type SheetState = {
	/** A deferred `Body` calls this once its children mounted, so Root can
	 *  hand focus to `initialFocusEl`. That element did not exist when Ark ran
	 *  its own initial focus, because the body was still a skeleton then. */
	bodyReady: () => void;
};

const SheetContext = createContext<SheetState>();

/** `Sheet.Skeleton`: the body's own placeholder, shown by `Body`. */
const skeletonPart = createSlotPart("Sheet", "Skeleton", "Sheet.Root", {
	unique: true,
});

function useSheet(part: string): SheetState {
	return useRequiredContext(SheetContext, `Sheet.${part}`, "Sheet.Root");
}

export type SheetRootProps = Required<Pick<DialogRootProps, "open">> &
	/** Element to focus when the sheet opens (e.g. a title field). Defaults
	 *  to the content panel itself. */
	Pick<DialogRootProps, "initialFocusEl"> & {
		onOpenChange: (isOpen: NonNullable<DialogRootProps["open"]>) => void;
		children: JSX.Element;
	} & MorphOverlayProps &
	WithPartClasses<"backdrop" | "positioner" | "content">;

/**
 * Centred modal card built directly on Ark Dialog (the design-system Dialog is
 * a small confirmation card; a sheet is a large detail card with its own
 * header, scrolling body and footer). It morphs out of the row, card or button
 * that opened it, and closes back into the on-screen element showing `morph`'s
 * entity. Controlled via `open` / `onOpenChange`.
 *
 * A compound like the rest of the design system (`Table.Root`, `Accordion.*`):
 * `Sheet.Root` owns the overlay, focus and stacking; the consumer composes the
 * chrome from `Sheet.Header` / `Sheet.Title` / `Sheet.HeaderActions` /
 * `Sheet.Close` / `Sheet.Skeleton` / `Sheet.Body` / `Sheet.Footer`. Every part
 * renders inside `Root`'s Dialog, so `Title` and `Close` reach the Ark dialog
 * context they need.
 */
function Root(props: SheetRootProps): JSX.Element {
	/**
	 * Ark syncs a controlled `open` through a zag `track`, which is a
	 * `createEffect` whose FIRST run only records its dependencies. So a sheet
	 * that mounts shut and is opened before that first run presents zag with no
	 * transition to act on: the machine's initial state was computed as
	 * "closed", the track run reads `true` and records it without firing, and
	 * the panel stays shut with `open` permanently true. No error, no callback
	 * — it simply never appears.
	 *
	 * That is not hypothetical. A deep link that mounts the page and opens the
	 * sheet in one flush never showed the sheet, while reloading the very same
	 * URL worked, because waiting on the page's data put a real gap between
	 * the mount and the open.
	 *
	 * A sheet that is ALREADY open when it mounts is fine — zag computes its
	 * initial state from `open` and starts open — so only the shut-at-mount
	 * case waits, and only until the end of the current task, by which point
	 * the track effect has run and recorded `false`.
	 */
	const isOpenAtMount = untrack(() => props.open);
	const [settled, setSettled] = createSignal(false);
	/**
	 * The panel focuses ITSELF when it opens, not the first thing inside it.
	 *
	 * Ark's focus trap otherwise moves focus to the first tabbable descendant,
	 * which here is the first `HeaderActions` control. When that control has a
	 * tooltip that opens on focus, opening a sheet parked focus on it and
	 * flashed a stray, mis-positioned hint too. Focusing the content (it is
	 * `tabindex="-1"` and labelled by the title) announces the sheet instead, and
	 * leaves the sheet's own arrow/letter shortcuts to act from a neutral spot.
	 *
	 * An explicit `initialFocusEl` (to drop the caret in a field, say) still wins.
	 */
	let contentElement: HTMLElement | null = null;
	onMount(() => {
		const timer = setTimeout(() => {
			setSettled(true);
		}, 0);
		onCleanup(() => {
			clearTimeout(timer);
		});
	});
	function open(): boolean {
		return props.open && (isOpenAtMount || settled());
	}
	const presence = createMorphPresence({
		open,
		content: () => contentElement,
		...overlayMorphOptions(props),
		shows: () => props.morph,
	});
	/** The parts (header, body, the consumer's queries) build when the sheet
	 *  first shows, inside the morph's update so they are in its new
	 *  snapshot, and stay built after. */
	const hasOpened = createMemo(
		(wasOpened: boolean) => wasOpened || presence.shown(),
		false
	);
	/** A deferred `Body`'s children mounted after Ark's own initial focus ran
	 *  against a skeleton. Re-apply `initialFocusEl` now that the real target
	 *  exists — but only if focus is still where Ark parked it (the content
	 *  panel), so someone who has since tabbed or clicked elsewhere isn't
	 *  yanked back. */
	function onBodyReady(): void {
		const target = props.initialFocusEl?.();
		if (target && document.activeElement === contentElement) target.focus();
	}
	return (
		<SheetContext.Provider value={{ bodyReady: onBodyReady }}>
			<skeletonPart.Scope>
				<Dialog.Root
					open={presence.shown()}
					restoreFocus={false}
					onOpenChange={(details) => {
						props.onOpenChange(details.open);
					}}
					// A deferred `Body` means an `initialFocusEl` target (a field inside
					// it) may not exist yet when Ark runs this on mount — `()=>null`
					// makes Ark's focus-trap throw internally (it treats `null`, unlike
					// `undefined`, as "specified but invalid") and land nowhere. Falling
					// back to `contentElement` per call keeps Ark's own initial focus on the
					// panel in that case, which `onBodyReady` below checks for before
					// re-applying the real target once it mounts.
					initialFocusEl={() =>
						props.initialFocusEl?.() ?? contentElement
					}
					// The shell mounts at once, closed (unfocusable and invisible, see
					// `.content`), so the morph's target box exists on the first open:
					// mounted lazily, it did not exist yet when the morph looked for it.
					// Its parts build on the first open (`hasOpened`). No
					// `unmountOnExit`: the close is a CSS transition, which unmounting
					// would cut off.
				>
					<Portal>
						{/* Fades with the morph: see MORPH_SCRIM. */}
						<Dialog.Backdrop
							class={getPartStyles(styles, props, "backdrop")}
							{...{ [MORPH_SCRIM]: "" }}
						/>
						<Dialog.Positioner
							class={getPartStyles(styles, props, "positioner")}
						>
							<Dialog.Content
								class={getPartStyles(styles, props, "content")}
								// A sheet is a detail panel, not a confirmation: bare-letter
								// shortcuts and nav arrows are meant to act on the thing it shows
								// while focus rests in it. This opts the panel out of
								// `isTypingTarget`'s "an open dialog claims its keystrokes" rule, so
								// those shortcuts fire; real inputs inside it are still caught, so
								// typing a field never triggers one.
								data-shortcut-surface="true"
								ref={(element: HTMLElement) => {
									contentElement = element;
								}}
							>
								<Show when={hasOpened()}>{props.children}</Show>
							</Dialog.Content>
						</Dialog.Positioner>
					</Portal>
				</Dialog.Root>
			</skeletonPart.Scope>
		</SheetContext.Provider>
	);
}

/** The header row: put a {@link Title} and a {@link HeaderActions} inside it. */
function Header(props: { children: JSX.Element }): JSX.Element {
	return <header class={styles.header}>{props.children}</header>;
}

/** The sheet's accessible name — labels the content panel via Ark's dialog.
 *  `loading` swaps the text for a shimmer while the row it names has not
 *  arrived. */
function Title(props: {
	children: JSX.Element;
	loading?: boolean;
}): JSX.Element {
	return (
		<Dialog.Title
			class={styles.title}
			// No flight into a shimmer bar: the title flies once it has text.
			{...{
				get [MORPH_TITLE]() {
					return props.loading ? undefined : "";
				},
			}}
		>
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

const DEFAULT_SKELETON_ROWS = 6;

/** Marks each bar pair of the generic skeleton (inside a
 *  {@link SHEET_SKELETON}). */
export const SHEET_SKELETON_ROW = "data-sheet-skeleton-row";

/** Label/value placeholder bars in the `PropertyRow` rhythm: the body's
 *  skeleton when no {@link SheetSkeleton} shapes one. */
function GenericSkeletonRows(props: { rows?: number }): JSX.Element {
	return (
		<Index
			each={Array.from({ length: props.rows ?? DEFAULT_SKELETON_ROWS })}
		>
			{(_, index) => (
				<div
					class={styles.bodySkeletonRow}
					{...{ [SHEET_SKELETON_ROW]: "" }}
				>
					<Skeleton width="short" />
					<Skeleton width={index % 2 === 0 ? "long" : "medium"} />
				</div>
			)}
		</Index>
	);
}

/**
 * The body's own placeholder while it loads, in place of the generic bars.
 * Sits next to `Sheet.Body`, not inside it: the body builds its children only
 * after the skeleton has painted, so a part inside them would come too late.
 * One per sheet; a second one throws in development.
 *
 * Its children are literal "placeholder" markup made of lightweight
 * components (no queries, tooltips or inputs). They are built each time the
 * body shows its skeleton, and rendered through `Skeleton`'s measured mode:
 * they mount hidden, their leaf boxes are measured before the browser
 * paints, and a shimmer overlay tracks those boxes.
 */
const SheetSkeleton: (props: { children: JSX.Element }) => JSX.Element =
	skeletonPart.Part;

export type SheetBodyProps = {
	children: JSX.Element;
	/** Holds the skeleton while what the body shows has not arrived. */
	loading?: boolean;
};

/**
 * The scrolling body. Always skeleton-first: the sheet shell paints at once
 * with a skeleton, and the children build after that paint. A rich body can
 * be a few hundred milliseconds of work, and without this the click froze
 * with no feedback. `loading` holds the skeleton longer.
 *
 * The skeleton is a {@link SheetSkeleton} when the sheet has one, the generic
 * bars otherwise. Either way it carries `role="status" aria-label="Loading"`
 * and `SHEET_SKELETON`, so a test (or a11y tooling) can assert "a skeleton is
 * showing" without caring which one is in play.
 */
function Body(props: SheetBodyProps): JSX.Element {
	const sheet = useSheet("Body");
	function Mounted(mountedProps: { children: JSX.Element }): JSX.Element {
		onMount(sheet.bodyReady);
		return <>{mountedProps.children}</>;
	}
	return (
		<div class={styles.body} {...{ [SHEET_BODY]: "" }}>
			<Deferred
				hold={props.loading}
				fallback={
					<div
						class={styles.bodySkeleton}
						role="status"
						aria-label="Loading"
						{...{ [SHEET_SKELETON]: "" }}
					>
						<skeletonPart.Slot fallback={<GenericSkeletonRows />}>
							{(content) => (
								<Skeleton visible>{content}</Skeleton>
							)}
						</skeletonPart.Slot>
					</div>
				}
			>
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
			asChild={(triggerProps) => (
				<IconButton
					triggerProps={triggerProps()}
					tooltipLabel="Close"
					shortcut="Escape"
				>
					{ICONS.close}
				</IconButton>
			)}
		/>
	);
}

export const Sheet = {
	Root,
	Header,
	Title,
	HeaderActions,
	Skeleton: SheetSkeleton,
	Body,
	Footer,
	Close,
};
