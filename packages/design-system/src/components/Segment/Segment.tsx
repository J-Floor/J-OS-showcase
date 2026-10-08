import { SegmentGroup as ArkSegment } from "@ark-ui/solid";
import clsx from "clsx";
import { splitProps } from "solid-js";

import {
	separateDisablingProps,
	type PropsWithDisabling,
} from "../../utils/disablingProps.ts";
import { MakeDisablable } from "../MakeDisablable/MakeDisablable.tsx";

import styles from "./Segment.module.scss";

function Root(props: ArkSegment.RootProps) {
	return (
		<ArkSegment.Root {...props} class={clsx(styles.segment, props.class)}>
			{props.children}
			<ArkSegment.Indicator class={styles.indicator} />
		</ArkSegment.Root>
	);
}

function Item(
	props: Omit<ArkSegment.ItemProps, "disabled"> & PropsWithDisabling
) {
	const [otherProps, disablingProps] = separateDisablingProps(props);
	const [local, itemProps] = splitProps(otherProps, ["children"]);
	return (
		<MakeDisablable {...disablingProps}>
			<ArkSegment.Item {...itemProps} class={styles.item}>
				<ArkSegment.ItemText>{local.children}</ArkSegment.ItemText>
				<ArkSegment.ItemControl />
				<ArkSegment.ItemHiddenInput />
			</ArkSegment.Item>
		</MakeDisablable>
	);
}

export const Segment = { Root, Item };
