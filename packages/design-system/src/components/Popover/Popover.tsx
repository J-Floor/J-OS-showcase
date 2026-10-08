import { Popover as ArkPopover } from "@ark-ui/solid";
import clsx from "clsx";
import { Portal } from "solid-js/web";

import styles from "./Popover.module.scss";

function Content(props: ArkPopover.ContentProps) {
	return (
		<Portal>
			<ArkPopover.Positioner class={styles.positioner}>
				<ArkPopover.Content
					{...props}
					class={clsx(styles.content, props.class)}
				>
					{props.children}
				</ArkPopover.Content>
			</ArkPopover.Positioner>
		</Portal>
	);
}

function Title(props: ArkPopover.TitleProps) {
	return (
		<ArkPopover.Title {...props} class={clsx(styles.title, props.class)}>
			{props.children}
		</ArkPopover.Title>
	);
}

function Description(props: ArkPopover.DescriptionProps) {
	return (
		<ArkPopover.Description {...props}>
			{props.children}
		</ArkPopover.Description>
	);
}

/** Ark's Root with content mounted on first open (kept mounted after, so
 *  the close transition still plays). Every trigger in a
 *  virtualised table row carries a popover; building each one's content up
 *  front was the bulk of a roster's render time. */
function Root(props: ArkPopover.RootProps) {
	return <ArkPopover.Root lazyMount {...props} />;
}

export const Popover = {
	Root,
	ClickTrigger: ArkPopover.Trigger,
	Content,
	Title,
	Description,
	CloseTrigger: ArkPopover.CloseTrigger,
};
