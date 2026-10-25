import { Dialog, type DialogRootProps } from "@ark-ui/solid/dialog";
import {
	createContext,
	createEffect,
	createSignal,
	Index,
	on,
	onMount,
	Show,
} from "solid-js";
import type { JSX } from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { useRequiredContext } from "../../utils/context.ts";
import { SHEET_SKELETON } from "../../utils/morphPairing.ts";
import { type MorphOverlayProps } from "../../utils/morphPresence.ts";
import {
	OverlayBackdrop,
	OverlayContent,
	OverlayParts,
	OverlayRoot,
	OverlayTitle,
	type OverlayOpenProps,
} from "../../utils/overlayLayer.tsx";
import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import { createSlotPart } from "../../utils/presence.tsx";
import {
	type SaveTracker,
	SaveTrackerContext,
	createSaveTracker,
} from "../../utils/saveTracker.ts";
import { Deferred } from "../Deferred/Deferred.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";
import { Skeleton } from "../Skeleton/Skeleton.tsx";

import { DiscardDialog } from "./DiscardDialog.tsx";
import { SaveStatus } from "./SaveStatus.tsx";
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

export type SheetRootProps = OverlayOpenProps &
	/** Element to focus when the sheet opens (e.g. a title field). Defaults
	 *  to the content panel itself. */
	Pick<DialogRootProps, "initialFocusEl"> & {
		children: JSX.Element;
		/**
		 * Build the parts while still closed, so the first open's morph finds
		 * them and the values fly as they do on every later open. Set it on a
		 * sign the sheet is about to open (a row's hover intent). Its content
		 * stays hidden while closed.
		 */
		prebuild?: boolean;
		/**
		 * Asked before any close the sheet hears (its close button, Escape,
		 * an outside click): true keeps the sheet's draft and asks first, in
		 * the discard dialog the sheet morphs into. Discard then closes it;
		 * Keep editing morphs back into the sheet.
		 */
		confirmClose?: () => boolean;
		/** What the discard dialog would throw away: "new event" asks
		 *  "Discard new event?". */
		discardLabel?: string;
		/**
		 * Hands over `ask(onDiscard)`, which opens the discard dialog for a
		 * way out the sheet cannot hear itself (the router leaving the
		 * page): Discard runs `onDiscard` instead of closing, Keep editing
		 * drops it. `onDiscard` is expected to close the sheet.
		 */
		discardRef?: (ask: (onDiscard: () => void) => void) => void;
		/** The tracker its parts report saves to, for fields built outside
		 *  the sheet; one of its own otherwise. */
		saveTracker?: SaveTracker;
	} & MorphOverlayProps &
	WithPartClasses<"backdrop" | "positioner" | "content">;

/**
 * Centred modal card built directly on Ark Dialog (the design-system Dialog is
 * a small confirmation card; a sheet is a large detail card with its own
 * header, scrolling body and footer). It morphs out of the row, card or button
 * that opened it, and closes back into the on-screen element showing `morphId`'s
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
	/** A deferred `Body`'s children mounted after Ark's own initial focus ran
	 *  against a skeleton. Re-apply `initialFocusEl` now that the real target
	 *  exists — but only if focus is still where Ark parked it (the content
	 *  panel), so someone who has since tabbed or clicked elsewhere isn't
	 *  yanked back. */
	function onBodyReady(): void {
		const target = props.initialFocusEl?.();
		if (target && document.activeElement === contentElement) target.focus();
	}
	const guard = createCloseGuard(props);
	// eslint-disable-next-line solid/reactivity -- handed over once, like a ref
	props.discardRef?.(guard.ask);
	return (
		<SheetContext.Provider value={{ bodyReady: onBodyReady }}>
			<SaveTrackerContext.Provider
				// The tracker is the sheet's for its lifetime, like its parts.
				// eslint-disable-next-line solid/reactivity -- read once at setup
				value={props.saveTracker ?? createSaveTracker()}
			>
				<skeletonPart.Scope>
					<OverlayRoot
						open={props.open && !guard.isAside()}
						morphId={props.morphId}
						morphFrom={props.morphFrom}
						shows={() => props.morphId}
						prebuild={props.prebuild}
						onOpenChange={guard.onOpenChange}
						handsOnSource={guard.isAside}
						// A deferred `Body` means an `initialFocusEl` target (a field inside
						// it) may not exist yet when Ark runs this on open; the layer then
						// focuses the panel, and `onBodyReady` moves focus on once it mounts.
						initialFocusEl={props.initialFocusEl}
						// The shell mounts at once, closed (unfocusable and invisible, see
						// `.content`), so the morph's target box exists on the first open:
						// mounted lazily, it did not exist yet when the morph looked for it.
						// Its parts build on the first open, or before it with `prebuild`.
						// No `unmountOnExit`: the close is a CSS transition, which
						// unmounting would cut off.
					>
						<Portal>
							{/* Fades with the morph: see MORPH_SCRIM. */}
							<OverlayBackdrop
								class={getPartStyles(styles, props, "backdrop")}
							/>
							<Dialog.Positioner
								class={getPartStyles(
									styles,
									props,
									"positioner"
								)}
							>
								<OverlayContent
									class={getPartStyles(
										styles,
										props,
										"content"
									)}
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
									<OverlayParts>
										{props.children}
									</OverlayParts>
								</OverlayContent>
							</Dialog.Positioner>
						</Portal>
					</OverlayRoot>
					<Show when={props.confirmClose}>
						<DiscardDialog
							open={guard.isAsking()}
							label={props.discardLabel}
							onKeep={guard.keepEditing}
							onDiscard={guard.discard}
						/>
					</Show>
				</skeletonPart.Scope>
			</SaveTrackerContext.Provider>
		</SheetContext.Provider>
	);
}

/**
 * `confirmClose`: a close the sheet hears while the guard says yes sets the
 * sheet aside for the discard dialog instead of reaching the caller. The
 * caller's `open` stays true meanwhile; the sheet's parts, and the draft in
 * them, stay built.
 */
function createCloseGuard(props: SheetRootProps) {
	/** Closed for the dialog, or after Discard until the caller closes. */
	const [isAside, setAside] = createSignal(false);
	const [isAsking, setAsking] = createSignal(false);
	/** The caller's way out for the dialog open now, from `ask`. */
	let callerDiscard: (() => void) | undefined;
	function setAsideToAsk(): void {
		// In this order, each its own write: the sheet's close offers its
		// handoff, which the dialog's open then claims.
		setAside(true);
		setAsking(true);
	}
	createEffect(
		on(
			() => props.open,
			(isOpen) => {
				if (isOpen) return;
				callerDiscard = undefined;
				setAsking(false);
				setAside(false);
			},
			{ defer: true }
		)
	);
	return {
		isAside,
		isAsking,
		onOpenChange: (isOpen: boolean): void => {
			if (isOpen || props.confirmClose?.() !== true) {
				props.onOpenChange(isOpen);
				return;
			}
			callerDiscard = undefined;
			setAsideToAsk();
		},
		ask: (onDiscard: () => void): void => {
			callerDiscard = onDiscard;
			setAsideToAsk();
		},
		keepEditing: (): void => {
			callerDiscard = undefined;
			// The dialog's close offers the handoff back first.
			setAsking(false);
			setAside(false);
		},
		discard: (): void => {
			const onDiscard = callerDiscard;
			callerDiscard = undefined;
			setAsking(false);
			if (onDiscard) onDiscard();
			else props.onOpenChange(false);
		},
	};
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
		// No flight into a shimmer bar: the title flies once it has text.
		<OverlayTitle class={styles.title} loading={props.loading}>
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
		</OverlayTitle>
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
	SaveStatus,
};
