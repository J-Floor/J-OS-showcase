import { Dialog as ArkDialog } from "@ark-ui/solid";
import clsx from "clsx";
import { createContext, splitProps, useContext } from "solid-js";
import { Portal } from "solid-js/web";

import { ICONS } from "../../icons.ts";
import {
	type MorphOverlayProps,
	createMorphPresence,
	overlayMorphOptions,
} from "../../utils/morphPresence.ts";
import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import { IconButton } from "../IconButton/IconButton.tsx";

import styles from "./Dialog.module.scss";

/**
 * Where `Content` hands its element to `Root`, so the dialog can focus ITSELF
 * on open. See {@link Root} for why that matters. Plain mutable capture rather
 * than a signal: it is read once, inside a zag callback, never rendered.
 */
const ContentReference = createContext<{
	set: (element: HTMLElement) => void;
	get: () => HTMLElement | null;
}>();

/**
 * Modal dialog. Ported from EmboUI's Dialog (React→Solid: `@ark-ui/react` →
 * `@ark-ui/solid`; no `forwardRef`). Same part composition as embo — the
 * backdrop + positioner + content card are portaled out of `Content`, and a
 * close button is baked into the top-trailing corner — so the authoring shape
 * (Root / Trigger / Content / Title / Description) is unchanged.
 */
function Content(
	props: ArkDialog.ContentProps &
		WithPartClasses<"backdrop" | "positioner" | "content" | "close">
) {
	const [local, rest] = splitProps(props, [
		"classOverride",
		"class",
		"children",
	]);
	const contentReference = useContext(ContentReference);
	return (
		<Portal>
			<ArkDialog.Backdrop
				class={getPartStyles(styles, local, "backdrop")}
			/>
			<ArkDialog.Positioner
				class={getPartStyles(styles, local, "positioner")}
			>
				<ArkDialog.Content
					{...rest}
					ref={(element: HTMLElement) => {
						contentReference?.set(element);
					}}
					class={clsx(
						getPartStyles(styles, local, "content"),
						local.class
					)}
				>
					<ArkDialog.CloseTrigger
						asChild={(closeProps) => (
							<IconButton
								{...(closeProps() as object)}
								tooltipLabel="Close"
								class={getPartStyles(styles, local, "close")}
							>
								{ICONS.close}
							</IconButton>
						)}
					/>
					{local.children}
				</ArkDialog.Content>
			</ArkDialog.Positioner>
		</Portal>
	);
}

function Title(props: ArkDialog.TitleProps) {
	return (
		<ArkDialog.Title {...props} class={clsx(styles.title, props.class)}>
			{props.children}
		</ArkDialog.Title>
	);
}

function Description(props: ArkDialog.DescriptionProps) {
	return (
		<ArkDialog.Description
			{...props}
			class={clsx(styles.description, props.class)}
		>
			{props.children}
		</ArkDialog.Description>
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
 * The close button is skipped by its own `styles.close` class. (Not by the Ark
 * `close-trigger` data-part: the close IconButton is ALSO a tooltip trigger, and
 * the tooltip's `data-part="trigger"` overwrites Ark's on the merged element, so
 * that marker never survives.) Returns null when the close button is the only
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
 *   {@link firstDialogFocusable}). Consumer props are spread AFTER, so an
 *   explicit `initialFocusEl` still wins.
 * - It morphs out of the element that opened it and back into it on close
 *   (`createMorphPresence`); see {@link MorphOverlayProps}.
 */
function Root(
	props: Omit<ArkDialog.RootProps, "open" | "defaultOpen"> &
		MorphOverlayProps & {
			/** Controlled only: the morph needs to own when Ark sees it open. */
			open: boolean;
		}
) {
	const [local, rest] = splitProps(props, ["open", "morph", "morphFrom"]);
	let contentElement: HTMLElement | null = null;
	const presence = createMorphPresence({
		open: () => local.open,
		content: () => contentElement,
		...overlayMorphOptions(local),
	});
	return (
		<ContentReference.Provider
			value={{
				set: (element) => {
					contentElement = element;
				},
				get: () => contentElement,
			}}
		>
			<ArkDialog.Root
				initialFocusEl={() =>
					firstDialogFocusable(contentElement) ?? contentElement
				}
				restoreFocus={false}
				{...rest}
				open={presence.shown()}
			/>
		</ContentReference.Provider>
	);
}

export const Dialog = {
	Root,
	Trigger: ArkDialog.Trigger,
	Content,
	Title,
	Description,
	CloseTrigger: ArkDialog.CloseTrigger,
};
