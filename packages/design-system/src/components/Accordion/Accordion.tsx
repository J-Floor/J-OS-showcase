import { Accordion as ArkAccordion } from "@ark-ui/solid/accordion";
import { type Hotkey } from "@tanstack/solid-hotkeys";
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
 *  - The trigger needs both an accordion machine AND a tooltip. Per the
 *    ark-solid-composition rule, the tooltip anchors to a wrapping `<span>`
 *    (its own element/id) rather than sharing the trigger button's id, so the
 *    tooltip positions correctly.
 */
function Root(props: ArkAccordion.RootProps): JSX.Element {
	return (
		<ArkAccordion.Root
			collapsible
			{...props}
			class={clsx(styles.accordions, props.class)}
		>
			{props.children}
		</ArkAccordion.Root>
	);
}

function Item(props: ArkAccordion.ItemProps & PropsWithDisabling): JSX.Element {
	const [otherProps, disabling] = separateDisablingProps(props);
	return (
		<MakeDisablable {...disabling}>
			<ArkAccordion.Item
				{...otherProps}
				// Keep the item natively disabled too (embo only dims via the
				// wrapper); this also blocks expansion, not just interaction visuals.
				disabled={disabling.disabled}
				class={clsx(styles.item, otherProps.class)}
			>
				{otherProps.children}
			</ArkAccordion.Item>
		</MakeDisablable>
	);
}

export type ItemTitleProps = Omit<ArkAccordion.ItemTriggerProps, "children"> & {
	children: JSX.Element;
	/** Secondary line shown under the title. */
	subtitle?: JSX.Element;
	/**
	 * A key that expands/collapses this section, shown as a chip at the trailing
	 * edge of the header — but only while peeking (Alt held, or the topbar toggle
	 * latched), like every other inline shortcut hint. The chip is display only;
	 * the binding itself lives with whoever owns the section's open state.
	 */
	shortcut?: Hotkey;
} & WithPartClasses<
		"itemTrigger" | "itemIndicator" | "itemTitle" | "itemSubtitle"
	>;

function ItemTitle(props: ItemTitleProps): JSX.Element {
	const [local, triggerRest] = splitProps(props, [
		"children",
		"subtitle",
		"shortcut",
		"class",
		"classOverride",
	]);
	return (
		<ArkAccordion.ItemContext>
			{(itemState) => (
				<Tooltip
					tooltipContent={
						itemState().expanded ? "Collapse" : "Expand"
					}
					asChild={(tip) => (
						<span
							{...(tip() as object)}
							class={styles.triggerAnchor}
						>
							<ArkAccordion.ItemTrigger
								{...triggerRest}
								class={getPartStyles(
									styles,
									local,
									"itemTrigger"
								)}
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
								<Show
									when={local.subtitle}
									fallback={
										<span
											class={clsx(
												getPartStyles(
													styles,
													local,
													"itemTitle"
												),
												local.class
											)}
										>
											{local.children}
										</span>
									}
								>
									<span
										class={clsx(
											styles.itemHeader,
											local.class
										)}
									>
										<span
											class={getPartStyles(
												styles,
												local,
												"itemTitle"
											)}
										>
											{local.children}
										</span>
										<span
											class={getPartStyles(
												styles,
												local,
												"itemSubtitle"
											)}
										>
											{local.subtitle}
										</span>
									</span>
								</Show>
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
						</span>
					)}
				/>
			)}
		</ArkAccordion.ItemContext>
	);
}

function ItemContent(props: ArkAccordion.ItemContentProps): JSX.Element {
	const [local, rest] = splitProps(props, ["children", "class"]);
	return (
		<ArkAccordion.ItemContent
			{...rest}
			class={clsx(styles.itemContent, local.class)}
		>
			{local.children}
		</ArkAccordion.ItemContent>
	);
}

export const Accordion = {
	Root,
	Item,
	ItemTitle,
	ItemContent,
};
