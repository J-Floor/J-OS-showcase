import { Accordion as ArkAccordion } from "@ark-ui/solid/accordion";
import clsx from "clsx";
import { type JSX, Show, splitProps } from "solid-js";

import { ICONS } from "../../icons.ts";
import {
	separateDisablingProps,
	type PropsWithDisabling,
} from "../../utils/disablingProps.ts";
import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import { type ShortcutHint } from "../../utils/types.ts";
import { Icon } from "../Icon/Icon.tsx";
import { Kbd } from "../Kbd/Kbd.tsx";
import { MakeDisablable } from "../MakeDisablable/MakeDisablable.tsx";
import { Tooltip } from "../Tooltip/Tooltip.tsx";

import styles from "./Accordion.module.scss";

/**
 * Collapsible grouped sections. Ported from EmboUI's Accordion.
 *
 * React→Solid adaptations:
 *  - EmboUI uses `createComponentSlots` to pluck `Title`/`Content` out of an
 *    item's children. Solid has no equivalent child-type detection, so the parts
 *    are real wrapper components instead: `ItemTitle` renders the trigger (with
 *    the expand/collapse indicator + tooltip) directly, and `ItemContent` wraps
 *    the collapsible body. Authoring shape is unchanged from embo's fixture.
 *  - The open/closed indicator glyph + tooltip text read the per-item state via
 *    `ArkAccordion.ItemContext` (zag's `ItemState.expanded`).
 *  - The trigger needs both an accordion machine AND a tooltip, so the
 *    tooltip points at it through `Tooltip.Anchor`.
 */
export type AccordionRootProps = ArkAccordion.RootProps;

function Root(props: AccordionRootProps): JSX.Element {
	const [local, rest] = splitProps(props, ["children", "class"]);
	return (
		<ArkAccordion.Root
			collapsible
			{...rest}
			class={clsx(styles.accordions, local.class)}
		>
			{local.children}
		</ArkAccordion.Root>
	);
}

export type AccordionItemProps = ArkAccordion.ItemProps & PropsWithDisabling;

function Item(props: AccordionItemProps): JSX.Element {
	const [otherProps, disabling] = separateDisablingProps(props);
	const [local, rest] = splitProps(otherProps, ["children", "class"]);
	return (
		<MakeDisablable {...disabling}>
			<ArkAccordion.Item
				{...rest}
				// Keep the item natively disabled too (embo only dims via the
				// wrapper); this also blocks expansion, not just interaction visuals.
				disabled={disabling.disabled}
				class={clsx(styles.item, local.class)}
			>
				{local.children}
			</ArkAccordion.Item>
		</MakeDisablable>
	);
}

export type AccordionItemTitleProps = Omit<
	ArkAccordion.ItemTriggerProps,
	"children"
> & {
	/** The title; an {@link ItemSubtitle} inside it adds a second line. */
	children: JSX.Element;
	/**
	 * A key that expands/collapses this section, shown as a chip at the trailing
	 * edge of the header — but only while peeking (Alt held, or the topbar toggle
	 * latched), like every other inline shortcut hint. The chip is display only;
	 * the binding itself lives with whoever owns the section's open state.
	 */
	shortcut?: ShortcutHint;
} & WithPartClasses<"itemTrigger" | "itemIndicator" | "itemTitle">;

function ItemTitle(props: AccordionItemTitleProps): JSX.Element {
	const [local, triggerRest] = splitProps(props, [
		"children",
		"shortcut",
		"class",
		"classOverride",
	]);
	return (
		<ArkAccordion.ItemContext>
			{(itemState) => (
				<Tooltip.Anchor
					label={itemState().expanded ? "Collapse" : "Expand"}
					class={styles.triggerAnchor}
				>
					<ArkAccordion.ItemTrigger
						{...triggerRest}
						class={getPartStyles(styles, local, "itemTrigger")}
					>
						<ArkAccordion.ItemIndicator
							class={getPartStyles(
								styles,
								local,
								"itemIndicator"
							)}
						>
							<Icon>
								{itemState().expanded
									? ICONS.collapseAll
									: ICONS.expandAll}
							</Icon>
						</ArkAccordion.ItemIndicator>
						<span
							class={clsx(
								getPartStyles(styles, local, "itemTitle"),
								local.class
							)}
						>
							{local.children}
						</span>
						<Show when={local.shortcut} keyed>
							{(shortcut) => (
								<Kbd
									shortcut={shortcut}
									inline
									class={styles.itemShortcut}
								/>
							)}
						</Show>
					</ArkAccordion.ItemTrigger>
				</Tooltip.Anchor>
			)}
		</ArkAccordion.ItemContext>
	);
}

export type AccordionItemSubtitleProps = {
	children: JSX.Element;
	class?: string;
};

/** A secondary line under the title. Goes inside {@link ItemTitle}. */
function ItemSubtitle(props: AccordionItemSubtitleProps): JSX.Element {
	return (
		<span class={clsx(styles.itemSubtitle, props.class)}>
			{props.children}
		</span>
	);
}

export type AccordionItemContentProps = ArkAccordion.ItemContentProps;

function ItemContent(props: AccordionItemContentProps): JSX.Element {
	const [local, rest] = splitProps(props, ["children", "class"]);
	return (
		<ArkAccordion.ItemContent
			{...rest}
			class={clsx(styles.itemContent, local.class)}
		>
			{/* The padding sits inside the part that slides: on the sliding
			    part itself it would stay when the slide reaches 0. */}
			<div class={styles.itemBody}>{local.children}</div>
		</ArkAccordion.ItemContent>
	);
}

export const Accordion = {
	Root,
	Item,
	ItemTitle,
	ItemSubtitle,
	ItemContent,
};
