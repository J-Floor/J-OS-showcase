import {
	Toast as ArkToast,
	createToaster as arkCreateToaster,
	Toaster,
	type CreateToasterProps,
	type ToastRootProps,
} from "@ark-ui/solid/toast";
import clsx from "clsx";
import { Show, splitProps, type JSX } from "solid-js";

import { ICONS } from "../../icons.ts";
import { Icon } from "../Icon/Icon.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";
import { Status, useStatusIcon, type TStatus } from "../Status/Status.tsx";

import styles from "./Toast.module.scss";

const typeToStatusMap: Record<
	NonNullable<ArkToast.Options["type"]>,
	TStatus
> = {
	info: "info",
	success: "success",
	warning: "warning",
	error: "error",
	loading: "info",
};

/** Ark's `createToaster`, placed bottom-end unless told otherwise. Apps import
 *  it from here so they never reach into Ark directly. */
export function createToaster(
	options?: Partial<CreateToasterProps>
): ReturnType<typeof arkCreateToaster> {
	return arkCreateToaster({ placement: "bottom-end", ...options });
}

function StatusIcon(): JSX.Element {
	const iconName = useStatusIcon();
	// The typography mixin sizes the glyph from this wrapper; on the Icon itself
	// it would also set the heading font and show the ligature as text.
	return (
		<span class={styles.icon}>
			<Icon>{iconName()}</Icon>
		</span>
	);
}

/** A click on a toast runs that toast's own `action`, so the root takes no
 *  `onClick` of its own. */
export type ToastProps = {
	toaster: ReturnType<typeof createToaster>;
} & Omit<ToastRootProps, "onClick">;

export function Toast(props: ToastProps): JSX.Element {
	const [local, rootProps] = splitProps(props, [
		"toaster",
		"class",
		"children",
	]);

	return (
		<Toaster toaster={local.toaster}>
			{(toast) => (
				<ArkToast.Root
					{...rootProps}
					class={clsx(styles.toastRoot, local.class)}
					onClick={(event) => {
						// Only trigger the action when the close button was not hit.
						const onAction = toast().action?.onClick;
						if (
							onAction &&
							event.target instanceof Element &&
							!event.target.closest(
								'[data-scope="toast"][data-part="close-trigger"]'
							)
						) {
							onAction();
						}
					}}
					data-clickable={Boolean(toast().action?.onClick)}
				>
					<Status
						status={typeToStatusMap[toast().type ?? "info"]}
						class={styles.status}
					>
						<Show when={toast().type}>
							<StatusIcon />
						</Show>
						<div class={styles.text}>
							<ArkToast.Title class={styles.title}>
								{toast().title}
							</ArkToast.Title>
							<ArkToast.Description class={styles.description}>
								{toast().description}
							</ArkToast.Description>
						</div>
						{local.children}
						<ArkToast.CloseTrigger
							asChild={(closeProps) => (
								<IconButton
									triggerProps={closeProps()}
									tooltipLabel="Dismiss notification"
								>
									{ICONS.close}
								</IconButton>
							)}
						/>
					</Status>
				</ArkToast.Root>
			)}
		</Toaster>
	);
}
