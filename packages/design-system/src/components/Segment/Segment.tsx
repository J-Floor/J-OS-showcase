import { SegmentGroup as ArkSegment } from "@ark-ui/solid";
import clsx from "clsx";
import {
	createEffect,
	createUniqueId,
	type JSX,
	Show,
	splitProps,
} from "solid-js";

import {
	separateDisablingProps,
	type PropsWithDisabling,
} from "../../utils/disablingProps.ts";
import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";
import { MakeDisablable } from "../MakeDisablable/MakeDisablable.tsx";

import styles from "./Segment.module.scss";

/**
 * A radiogroup needs a name. `label` renders one above the segments; a group
 * whose purpose is already shown beside it takes `aria-label` instead.
 */
type SegmentName =
	| {
			/** Shown above the segments and used as the group's accessible name. */
			label: string;
			"aria-label"?: never;
	  }
	| { label?: never; "aria-label": string };

export type SegmentRootProps = Omit<ArkSegment.RootProps, "aria-label"> &
	SegmentName &
	WithPartClasses<"label" | "indicator">;

export type SegmentItemProps = PropsWithDisabling<
	Omit<ArkSegment.ItemProps, "disabled">
>;

function Root(props: SegmentRootProps): JSX.Element {
	const [local, rootProps] = splitProps(props, [
		"label",
		"children",
		"class",
		"classOverride",
	]);
	createEffect(() => {
		if (
			import.meta.env.DEV &&
			!props.label?.trim() &&
			!props["aria-label"]?.trim()
		) {
			// eslint-disable-next-line no-console -- a warning for the developer, not the user
			console.warn(
				"Segment.Root: the radiogroup has no name. Pass a non-empty label or aria-label."
			);
		}
	});
	const labelId = createUniqueId();
	function group(labelledBy?: string): JSX.Element {
		return (
			<ArkSegment.Root
				aria-labelledby={labelledBy}
				{...rootProps}
				class={clsx(styles.segment, local.class)}
			>
				{local.children}
				<ArkSegment.Indicator
					class={getPartStyles(styles, local, "indicator")}
				/>
			</ArkSegment.Root>
		);
	}
	// The label sits outside the track: inside it, it would be laid out as
	// one more segment. It names the group through `aria-labelledby`, the way
	// a fieldset legend would.
	return (
		<Show when={local.label !== undefined} fallback={group()}>
			<div class={styles.field}>
				<span
					id={labelId}
					class={getPartStyles(styles, local, "label")}
				>
					{local.label}
				</span>
				{group(labelId)}
			</div>
		</Show>
	);
}

function Item(props: SegmentItemProps): JSX.Element {
	// `others` keeps `disabled`, so the Ark item (and its radio) is disabled
	// too: the MakeDisablable dim alone would still take the keyboard.
	const [others, disablingProps] = separateDisablingProps(props);
	const [local, itemProps] = splitProps(others, ["children", "class"]);
	return (
		<MakeDisablable {...disablingProps}>
			<ArkSegment.Item
				{...itemProps}
				class={clsx(styles.item, local.class)}
			>
				<ArkSegment.ItemText>{local.children}</ArkSegment.ItemText>
				<ArkSegment.ItemControl />
				<ArkSegment.ItemHiddenInput />
			</ArkSegment.Item>
		</MakeDisablable>
	);
}

export const Segment = { Root, Item };
