import { Popover as ArkPopover } from "@ark-ui/solid";
import clsx from "clsx";
import { splitProps } from "solid-js";
import { Portal } from "solid-js/web";

import {
	getPartStyles,
	type WithPartClasses,
} from "../../utils/partStyling.ts";

import styles from "./Popover.module.scss";

export type PopoverContentProps = ArkPopover.ContentProps &
	WithPartClasses<"positioner" | "content">;

function Content(props: PopoverContentProps) {
	const [local, rest] = splitProps(props, [
		"classOverride",
		"class",
		"children",
	]);
	return (
		<Portal>
			<ArkPopover.Positioner
				class={getPartStyles(styles, local, "positioner")}
			>
				<ArkPopover.Content
					{...rest}
					class={clsx(
						getPartStyles(styles, local, "content"),
						local.class
					)}
				>
					{local.children}
				</ArkPopover.Content>
			</ArkPopover.Positioner>
		</Portal>
	);
}

function Title(props: ArkPopover.TitleProps) {
	const [local, rest] = splitProps(props, ["children", "class"]);
	return (
		<ArkPopover.Title {...rest} class={clsx(styles.title, local.class)}>
			{local.children}
		</ArkPopover.Title>
	);
}

/** Ark's Root with content mounted on first open (kept mounted after, so
 *  the close transition still plays). In a virtualised list where every row
 *  carries a popover, building each one's content up front was the bulk of
 *  the list's render time. */
function Root(props: ArkPopover.RootProps) {
	return <ArkPopover.Root lazyMount {...props} />;
}

export const Popover = {
	Root,
	ClickTrigger: ArkPopover.Trigger,
	Content,
	Title,
	Description: ArkPopover.Description,
	CloseTrigger: ArkPopover.CloseTrigger,
};
