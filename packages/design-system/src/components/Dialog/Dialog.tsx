import { Dialog as ArkDialog } from "@ark-ui/solid";
import clsx from "clsx";
import {
	createContext,
	createEffect,
	createSignal,
	onCleanup,
	splitProps,
	type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import { useRequiredContext } from "../../utils/context.ts";
import { type MorphOverlayProps } from "../../utils/morphPresence.ts";
import {
	OverlayBackdrop,
	OverlayBody,
	OverlayContent,
	OverlayRoot,
	OverlayTitle,
	type OverlayOpenProps,
} from "../../utils/overlayLayer.tsx";
import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import { listenForVerticalSwipe } from "../../utils/swipe.ts";
import type { DistributiveOmit } from "../../utils/types.ts";
import { Button, type ButtonProps } from "../Button/Button.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";

import styles from "./Dialog.module.scss";

/** Where the card sits: centred in the page, or against the bottom edge. */
export type DialogPlacement = "center" | "bottom";

export type DialogContentProps = ArkDialog.ContentProps &
	WithPartClasses<"backdrop" | "positioner" | "content"> & {
		/**
		 * `bottom` makes a bottom sheet: the card is full width against the
		 * bottom edge, its top corners rounded, and a swipe down on it
		 * closes the dialog. The card itself does not scroll (it leaves
		 * vertical pans to the swipe): a long {@link Body} scrolls instead,
		 * and a swipe that starts inside it scrolls it. Default `center`.
		 */
		placement?: DialogPlacement;
		/** Drops the card's padding and gap, for a card whose parts reach
		 *  its edges (a row that repeats a bar). */
		flush?: boolean;
	};

export type DialogRootProps = Omit<
	ArkDialog.RootProps,
	"open" | "defaultOpen" | "restoreFocus" | "onOpenChange"
> &
	MorphOverlayProps &
	Pick<OverlayOpenProps, "open"> &
	Partial<Pick<OverlayOpenProps, "onOpenChange">>;

/** How a part asks the root to close: the same request Escape and the close
 *  button make, heard as `onOpenChange(false)`. */
const CloseContext = createContext<() => void>();

/**
 * Modal dialog. Ported from EmboUI's Dialog (React→Solid: `@ark-ui/react` →
 * `@ark-ui/solid`; no `forwardRef`). The backdrop, positioner and content
 * card are portaled out of `Content`; inside it, `Header` (title,
 * description and the close button), `Body` and `Footer` lay the card out,
 * named and placed as `Sheet`'s parts are.
 *
 * What the card shows is built for each opening: built as it opens, kept
 * while it morphs closed (the card shrinks with its content in it), and
 * dropped after, so the next opening starts afresh and a closed dialog
 * leaves no inputs in the page. An opening made while the close still runs
 * starts afresh too. Gate nothing on the caller's `open`: it turns false
 * before the browser captures the closing card.
 */
function Content(props: DialogContentProps) {
	const [local, rest] = splitProps(props, [
		"classOverride",
		"class",
		"children",
		"placement",
		"flush",
		"ref",
	]);
	const close = useRequiredContext(
		CloseContext,
		"Dialog.Content",
		"Dialog.Root"
	);
	const [card, setCard] = createSignal<HTMLElement>();
	createEffect(() => {
		const element = card();
		if (!element || local.placement !== "bottom") return;
		onCleanup(
			listenForVerticalSwipe(element, {
				startsHere: () => true,
				onSwipe: (direction) => {
					if (direction === "down") close();
				},
			})
		);
	});
	function placement(): DialogPlacement {
		return local.placement ?? "center";
	}
	return (
		<Portal>
			{/* Fades with the morph: see MORPH_SCRIM. */}
			<OverlayBackdrop class={getPartStyles(styles, local, "backdrop")} />
			<ArkDialog.Positioner
				class={getPartStyles(styles, local, "positioner")}
				data-placement={placement()}
			>
				<OverlayContent
					{...rest}
					data-placement={placement()}
					data-flush={local.flush ? "" : undefined}
					ref={(element: HTMLDivElement) => {
						setCard(element);
						if (typeof local.ref === "function") local.ref(element);
					}}
					class={clsx(
						getPartStyles(styles, local, "content"),
						local.class
					)}
				>
					<OverlayBody>{local.children}</OverlayBody>
				</OverlayContent>
			</ArkDialog.Positioner>
		</Portal>
	);
}

/** The dialog's name, and the morph's title: a row or card that opens the
 *  dialog flies its own title into it. */
function Title(props: ArkDialog.TitleProps) {
	const [local, rest] = splitProps(props, ["children", "class"]);
	return (
		<OverlayTitle {...rest} class={clsx(styles.title, local.class)}>
			{local.children}
		</OverlayTitle>
	);
}

/** The header: put a {@link Title} (and a {@link Description}) inside it.
 *  It carries the close button, pinned to the card's top-trailing corner; a
 *  dialog without a header has none (a palette closes on Escape). */
function Header(props: { children: JSX.Element }): JSX.Element {
	return (
		<header class={styles.header}>
			{props.children}
			<ArkDialog.CloseTrigger
				asChild={(closeProps) => (
					<IconButton
						triggerProps={closeProps()}
						tooltipLabel="Close"
						class={styles.close}
					>
						{ICONS.close}
					</IconButton>
				)}
			/>
		</header>
	);
}

/** The content between the header and the footer: fields, a list, the
 *  message. */
function Body(props: { children: JSX.Element }): JSX.Element {
	return <div class={styles.body}>{props.children}</div>;
}

/** The trailing row of decision buttons: {@link Cancel} first, then the
 *  dialog's own action. */
function Footer(props: { children: JSX.Element }): JSX.Element {
	return <footer class={styles.footer}>{props.children}</footer>;
}

function Description(props: ArkDialog.DescriptionProps) {
	const [local, rest] = splitProps(props, ["children", "class"]);
	return (
		<ArkDialog.Description
			{...rest}
			class={clsx(styles.description, local.class)}
		>
			{local.children}
		</ArkDialog.Description>
	);
}

export type DialogCancelProps = DistributiveOmit<
	ButtonProps,
	"variant" | "triggerProps"
>;

/** A "Cancel" button that closes the dialog it sits in: a tertiary `Button`
 *  on the close trigger. Its children replace the "Cancel" label. */
function Cancel(props: DialogCancelProps) {
	const [local, rest] = splitProps(props, ["children"]);
	return (
		<ArkDialog.CloseTrigger
			asChild={(closeProps) => (
				<Button
					{...rest}
					triggerProps={closeProps()}
					variant="tertiary"
				>
					{local.children ?? "Cancel"}
				</Button>
			)}
		/>
	);
}

/**
 * The elements a focus trap would land on, in DOM order. Enough for picking a
 * sensible first focus; not a full `tabbable` implementation (no visibility or
 * inert checks), which is fine here — we only read within a dialog that just
 * opened, and Ark still runs the real trap for tab cycling afterwards.
 */
const FOCUSABLE_SELECTOR = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	'[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * The first control an opening dialog should land on: the first focusable inside
 * its content that ISN'T the baked-in close button.
 *
 * The close button is skipped by its own `styles.close` class. Returns null
 * when the close button is the only
 * focusable — a bare confirmation with no field — leaving the caller to fall back
 * to the content element.
 */
function firstDialogFocusable(content: HTMLElement | null): HTMLElement | null {
	if (!content) return null;
	for (const element of content.querySelectorAll<HTMLElement>(
		FOCUSABLE_SELECTOR
	)) {
		if (element.classList.contains(styles.close)) continue;
		return element;
	}
	return null;
}

/**
 * Dialog root. Two behaviours added:
 *
 * - An opening dialog focuses its first real control (see the notes on
 *   {@link firstDialogFocusable}). An `initialFocusEl` that names an element
 *   still wins.
 * - It morphs out of the element that opened it and back into it on close,
 *   through the overlay layer (`OverlayRoot`); see {@link MorphOverlayProps}.
 */
function Root(props: DialogRootProps) {
	function close(): void {
		props.onOpenChange?.(false);
	}
	return (
		<CloseContext.Provider value={close}>
			<OverlayRoot {...props} defaultFocus={firstDialogFocusable} />
		</CloseContext.Provider>
	);
}

export const Dialog = {
	Root,
	Trigger: ArkDialog.Trigger,
	Content,
	Header,
	Title,
	Description,
	Body,
	Footer,
	CloseTrigger: ArkDialog.CloseTrigger,
	Cancel,
};
