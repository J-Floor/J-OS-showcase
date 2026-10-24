import { Menu as ArkMenu } from "@ark-ui/solid";
import clsx from "clsx";
import { splitProps } from "solid-js";
import { Portal } from "solid-js/web";

import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";

import styles from "./Menu.module.scss";

/**
 * Dropdown menu. Ported from EmboUI's Menu (React→Solid: `@ark-ui/react` →
 * `@ark-ui/solid`; no `forwardRef`). Same part composition as embo — the
 * positioned content is portaled out of `Content` — so the authoring shape
 * (Root / Trigger / Content / Item / ItemGroup / Separator) is unchanged.
 * `Item` requires a `value` (ark uses it for keyboard typeahead + `onSelect`).
 */
export type MenuContentProps = ArkMenu.ContentProps &
	WithPartClasses<"positioner" | "content">;

function Content(props: MenuContentProps) {
	const [local, rest] = splitProps(props, [
		"classOverride",
		"class",
		"children",
	]);
	return (
		<Portal>
			<ArkMenu.Positioner
				class={getPartStyles(styles, local, "positioner")}
			>
				<ArkMenu.Content
					{...rest}
					class={clsx(
						getPartStyles(styles, local, "content"),
						local.class
					)}
				>
					{local.children}
				</ArkMenu.Content>
			</ArkMenu.Positioner>
		</Portal>
	);
}

function Item(props: ArkMenu.ItemProps) {
	const [local, rest] = splitProps(props, ["children", "class"]);
	return (
		<ArkMenu.Item {...rest} class={clsx(styles.item, local.class)}>
			{local.children}
		</ArkMenu.Item>
	);
}

function ItemGroup(props: ArkMenu.ItemGroupProps) {
	const [local, rest] = splitProps(props, ["children", "class"]);
	return (
		<ArkMenu.ItemGroup {...rest} class={clsx(styles.group, local.class)}>
			{local.children}
		</ArkMenu.ItemGroup>
	);
}

function ItemGroupLabel(props: ArkMenu.ItemGroupLabelProps) {
	const [local, rest] = splitProps(props, ["children", "class"]);
	return (
		<ArkMenu.ItemGroupLabel
			{...rest}
			class={clsx(styles.groupLabel, local.class)}
		>
			{local.children}
		</ArkMenu.ItemGroupLabel>
	);
}

function Separator(props: ArkMenu.SeparatorProps) {
	return (
		<ArkMenu.Separator
			{...props}
			class={clsx(styles.separator, props.class)}
		/>
	);
}

/** Ark's Root with content mounted on first open (kept after, so the close
 *  transition still plays). */
function Root(props: ArkMenu.RootProps) {
	return <ArkMenu.Root lazyMount {...props} />;
}

export const Menu = {
	Root,
	Trigger: ArkMenu.Trigger,
	Content,
	Item,
	ItemGroup,
	ItemGroupLabel,
	Separator,
};
