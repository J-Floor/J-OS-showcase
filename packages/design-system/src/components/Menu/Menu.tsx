import { Menu as ArkMenu } from "@ark-ui/solid";
import clsx from "clsx";
import { Portal } from "solid-js/web";

import styles from "./Menu.module.scss";

/**
 * Dropdown menu. Ported from EmboUI's Menu (React→Solid: `@ark-ui/react` →
 * `@ark-ui/solid`; no `forwardRef`). Same part composition as embo — the
 * positioned content is portaled out of `Content` — so the authoring shape
 * (Root / Trigger / Content / Item / ItemGroup / Separator) is unchanged.
 * `Item` requires a `value` (ark uses it for keyboard typeahead + `onSelect`).
 */
function Content(props: ArkMenu.ContentProps) {
	return (
		<Portal>
			<ArkMenu.Positioner class={styles.positioner}>
				<ArkMenu.Content
					{...props}
					class={clsx(styles.content, props.class)}
				>
					{props.children}
				</ArkMenu.Content>
			</ArkMenu.Positioner>
		</Portal>
	);
}

function Item(props: ArkMenu.ItemProps) {
	return (
		<ArkMenu.Item {...props} class={clsx(styles.item, props.class)}>
			{props.children}
		</ArkMenu.Item>
	);
}

function ItemGroup(props: ArkMenu.ItemGroupProps) {
	return (
		<ArkMenu.ItemGroup {...props} class={clsx(styles.group, props.class)}>
			{props.children}
		</ArkMenu.ItemGroup>
	);
}

function ItemGroupLabel(props: ArkMenu.ItemGroupLabelProps) {
	return (
		<ArkMenu.ItemGroupLabel
			{...props}
			class={clsx(styles.groupLabel, props.class)}
		>
			{props.children}
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
