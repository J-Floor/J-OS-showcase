import { Dialog as ArkDialog } from "@ark-ui/solid/dialog";
import {
	type Accessor,
	createComputed,
	createContext,
	createMemo,
	createRenderEffect,
	createSignal,
	type JSX,
	Show,
	children,
	on,
	onCleanup,
	splitProps,
	untrack,
} from "solid-js";

import { useRequiredContext } from "./context.ts";
import { MORPH_LAYER, MORPH_SCRIM, MORPH_TITLE } from "./morphNames.ts";
import {
	type MorphOverlayProps,
	createMorphPresence,
	createMorphHold,
	overlayMorphOptions,
} from "./morphPresence.ts";

/**
 * The layer every modal overlay (Sheet, Dialog and what is built on them) is
 * made of: an Ark dialog opened and closed through a morph
 * (`createMorphPresence`), its backdrop the morph's scrim, its title the
 * morph's title, and parts whose children live as long as the morph needs
 * them. Each overlay's stylesheet turns its own pop-in off under
 * `:root[data-vt~="morph"]`.
 */
type OverlayLayer = {
	/** What Ark is told: `open` as the morph lets it through. */
	isShown: Accessor<boolean>;
	/** How many overlays are shown above this one. */
	above: Accessor<number>;
	/** True from the first show on, or from `prebuild`. */
	isBuilt: Accessor<boolean>;
	/** Which show the body is for: the current one while shown, the one
	 *  that closed until its morph has finished, else `undefined`. */
	bodyFor: Accessor<number | undefined>;
	setContent: (element: HTMLElement) => void;
};

const OverlayContext = createContext<OverlayLayer>();

function useOverlay(part: string): OverlayLayer {
	return useRequiredContext(OverlayContext, part, "an overlay's Root");
}

/** The controlled-open pair every overlay takes (Sheet, Dialog and what is
 *  built on them): the morph owns when Ark sees it open, so `open` is
 *  controlled only, and a change is heard as the plain new state. */
export type OverlayOpenProps = {
	open: boolean;
	onOpenChange: (isOpen: boolean) => void;
};

type OverlayRootProps = Omit<
	ArkDialog.RootProps,
	"open" | "defaultOpen" | "restoreFocus" | "onOpenChange"
> &
	MorphOverlayProps &
	Pick<OverlayOpenProps, "open"> &
	Partial<Pick<OverlayOpenProps, "onOpenChange">> & {
		/** What the overlay shows; see `createMorphPresence`'s `shows`. */
		shows?: () => unknown;
		/** Build the parts before the first open, so that open's morph finds
		 *  them (a sheet's values fly into their fields). */
		prebuild?: boolean;
		/** Where focus lands on open when `initialFocusEl` names nothing;
		 *  the content panel itself when this names nothing either. */
		defaultFocus?: (content: HTMLElement | null) => HTMLElement | null;
		/** See `createMorphPresence`'s `handsOnSource`. */
		handsOnSource?: () => boolean;
	};

type Showing = { count: number; isShown: boolean };

/**
 * The content's own exit: its CSS transitions as it closes (the pop-out that
 * plays when no morph does). Read once the close has reached the page, so
 * they have started; an interrupted one counts as over.
 */
async function ownExit(content: HTMLElement | null): Promise<void> {
	if (typeof content?.getAnimations !== "function") return;
	await Promise.allSettled(
		content.getAnimations().map((animation) => animation.finished)
	);
}

/**
 * How many overlays are shown above an overlay's content, on the content as
 * a value-only custom property: a stylesheet steps a covered overlay back
 * by it (Sheet). Ark keeps its own count (`--nested-layer-count`), but
 * writes it a frame after an overlay opens: inside a morph that frame comes
 * after the new snapshot. This one changes as `shown` does, in the update.
 */
export const OVERLAYS_ABOVE_VAR = "--jf-overlays-above";

/** On an overlay's content while another is shown above it. */
export const OVERLAY_COVERED = "data-overlay-covered";

/** Every shown overlay, in the order they were shown. */
const [shownStack, setShownStack] = createSignal<readonly object[]>([]);

function withoutLayer(
	stack: readonly object[],
	layer: object
): readonly object[] {
	return stack.filter((entry) => entry !== layer);
}

/** Keeps this overlay in the stack while shown; returns how many overlays
 *  are shown above it. */
function createStackPlace(isShown: Accessor<boolean>): Accessor<number> {
	const layer = {};
	createComputed(
		on(isShown, (isShownNow) => {
			setShownStack((stack) =>
				isShownNow
					? [...withoutLayer(stack, layer), layer]
					: withoutLayer(stack, layer)
			);
		})
	);
	onCleanup(() => {
		setShownStack((stack) => withoutLayer(stack, layer));
	});
	const above = createMemo(() => {
		const stack = shownStack();
		const index = stack.indexOf(layer);
		return index === -1 ? 0 : stack.length - 1 - index;
	});
	return above;
}

/** Counts the shows, so a body can be built afresh for each. */
function createShowCount(isShown: Accessor<boolean>): Accessor<number> {
	const showing = createMemo(
		(previous: Showing) => {
			const isShownNow = isShown();
			return isShownNow === previous.isShown
				? previous
				: {
						count: previous.count + (isShownNow ? 1 : 0),
						isShown: isShownNow,
					};
		},
		{ count: 0, isShown: false }
	);
	const count = createMemo(() => showing().count);
	return count;
}

/**
 * An overlay's root: Ark's dialog root, opened through a morph. Ark's own
 * focus restore is off (the presence restores focus once the source shows
 * again).
 */
export function OverlayRoot(props: OverlayRootProps): JSX.Element {
	const [local, rest] = splitProps(props, [
		"open",
		"onOpenChange",
		"morphId",
		"morphFrom",
		"shows",
		"prebuild",
		"defaultFocus",
		"handsOnSource",
		"initialFocusEl",
		"children",
	]);
	const [shownBy, setShownBy] = createSignal<Accessor<boolean>>(() =>
		untrack(() => local.open)
	);
	function isShown(): boolean {
		return shownBy()();
	}
	let contentElement: HTMLElement | null = null;
	const isBuilt = createMemo(
		(wasBuilt: boolean) => wasBuilt || isShown() || local.prebuild === true,
		false
	);
	const layer: OverlayLayer = {
		isShown,
		above: createStackPlace(isShown),
		isBuilt,
		bodyFor: createMorphHold(createShowCount(isShown), isShown, () =>
			ownExit(contentElement)
		),
		setContent: (element) => {
			contentElement = element;
		},
	};
	/**
	 * Drives `shown` from `open`. Rendered inside Ark's root, so its effect
	 * runs after Ark has started watching `open`: a request made in the same
	 * flush as the mount (a caller opening from its own mount effect) then
	 * reaches the machine as a change. Ark's watch skips its first run, so a
	 * `shown` that flipped before it would be read as the starting value of a
	 * machine that started closed, and the overlay would never open.
	 */
	function Presence(): JSX.Element {
		const presence = createMorphPresence({
			open: () => local.open,
			content: () => contentElement,
			...overlayMorphOptions(local),
			shows: () => local.shows?.(),
			handsOnSource: () => local.handsOnSource?.() === true,
		});
		setShownBy(() => presence.shown);
		return null;
	}
	return (
		<ArkDialog.Root
			{...rest}
			restoreFocus={false}
			open={isShown()}
			onOpenChange={(details) => {
				local.onOpenChange?.(details.open);
			}}
			// Never `null`: Ark reads it as a target that is not there and
			// focuses nothing (a target inside a body not built yet, say).
			initialFocusEl={() =>
				local.initialFocusEl?.() ??
				local.defaultFocus?.(contentElement) ??
				contentElement
			}
		>
			<OverlayContext.Provider value={layer}>
				<Presence />
				{local.children}
			</OverlayContext.Provider>
		</ArkDialog.Root>
	);
}

/** The backdrop, marked as the morph's scrim (see `MORPH_SCRIM`). */
export function OverlayBackdrop(props: ArkDialog.BackdropProps): JSX.Element {
	return <ArkDialog.Backdrop {...props} {...{ [MORPH_SCRIM]: "" }} />;
}

/** The content panel: the morph's target. Marked while shown
 *  ({@link MORPH_LAYER}), with the overlays shown above it
 *  ({@link OVERLAYS_ABOVE_VAR}, {@link OVERLAY_COVERED}). */
export function OverlayContent(props: ArkDialog.ContentProps): JSX.Element {
	const layer = useOverlay("OverlayContent");
	const [local, rest] = splitProps(props, ["ref"]);
	return (
		<ArkDialog.Content
			{...rest}
			{...{
				get [MORPH_LAYER]() {
					return layer.isShown() ? "" : undefined;
				},
				get [OVERLAY_COVERED]() {
					return layer.above() > 0 ? "" : undefined;
				},
			}}
			ref={(element: HTMLDivElement) => {
				// Written on the element, beside Ark's own layer vars: a
				// `style` prop would compete with the caller's.
				createRenderEffect(() => {
					element.style.setProperty(
						OVERLAYS_ABOVE_VAR,
						String(layer.above())
					);
				});
				layer.setContent(element);
				if (typeof local.ref === "function") local.ref(element);
			}}
		/>
	);
}

/** The title, the morph's title. A `loading` one is not: nothing flies
 *  into a shimmer bar. */
export function OverlayTitle(
	props: ArkDialog.TitleProps & { loading?: boolean }
): JSX.Element {
	const [local, rest] = splitProps(props, ["loading"]);
	return (
		<ArkDialog.Title
			{...rest}
			{...{
				get [MORPH_TITLE]() {
					return local.loading ? undefined : "";
				},
			}}
		/>
	);
}

/** Children built on the first show (or `prebuild`) and kept after. */
export function OverlayParts(props: { children: JSX.Element }): JSX.Element {
	const layer = useOverlay("OverlayParts");
	return <Show when={layer.isBuilt()}>{props.children}</Show>;
}

/** Children built on each show and dropped once the close morph has
 *  finished: what the overlay showed stays in it as it closes, and every
 *  open starts afresh, even one made while the close still runs. */
export function OverlayBody(props: { children: JSX.Element }): JSX.Element {
	const layer = useOverlay("OverlayBody");
	// Each run owns what it built, so the next show's run disposes it.
	const body = createMemo(() =>
		layer.bodyFor() === undefined
			? undefined
			: children(() => props.children)
	);
	return <>{body()?.()}</>;
}
