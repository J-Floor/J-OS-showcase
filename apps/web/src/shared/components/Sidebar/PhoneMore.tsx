import { Dialog, Icon } from "@j-os/design-system";
import { useLocation } from "@solidjs/router";
import { For } from "solid-js";

import type { ModuleManifest } from "../../../modules/types.ts";
import { ICONS } from "../../icons.ts";

import type { PhoneMore } from "./createPhoneMore.ts";
import { NavItem } from "./NavItem.tsx";
import styles from "./Sidebar.module.scss";

/** The bar's last slot: opens the sheet of overflow pages. It carries the
 *  active state when the current page is one of them. */
export function MoreButton(props: {
	more: PhoneMore;
	overflow: readonly ModuleManifest[];
}) {
	const location = useLocation();
	function isOverflowActive(): boolean {
		return props.overflow.some(
			(module) =>
				location.pathname === module.path ||
				location.pathname.startsWith(`${module.path}/`)
		);
	}
	return (
		<button
			type="button"
			class={`${styles.item} ${styles.more}`}
			aria-haspopup="dialog"
			aria-expanded={props.more.isOpen()}
			aria-current={isOverflowActive() ? "true" : undefined}
			onClick={() => {
				props.more.toggle();
			}}
		>
			<Icon class={styles.icon}>{ICONS.navMore}</Icon>
			<span class={styles.label}>More</span>
		</button>
	);
}

/**
 * The overflow pages in a bottom sheet that grows out of the bar. Above them
 * sits a row drawn where the bar is, with the bar's pages and a Close in the
 * More slot, on the bar's five columns: the bottom row does not appear to
 * move. The sheet is a `Dialog`, so the scrim, Escape, pressing outside, the
 * focus trap, focus return and the swipe down are its own.
 */
export function MoreSheet(props: {
	more: PhoneMore;
	bar: readonly ModuleManifest[];
	overflow: readonly ModuleManifest[];
	/** The bar, which the sheet opens from. */
	barElement: () => HTMLElement | undefined;
}) {
	return (
		<Dialog.Root
			open={props.more.isOpen()}
			onOpenChange={props.more.setOpen}
			morphFrom={props.barElement}
		>
			<Dialog.Content placement="bottom" flush aria-label="More pages">
				<div class={styles.sheetPages}>
					<For each={props.overflow}>
						{(module) => (
							<NavItem
								module={module}
								onPick={props.more.close}
							/>
						)}
					</For>
				</div>
				<div class={styles.sheetRow}>
					<For each={props.bar}>
						{(module) => (
							<NavItem
								module={module}
								hasId={false}
								onPick={props.more.close}
							/>
						)}
					</For>
					<Dialog.CloseTrigger class={styles.item}>
						<Icon class={styles.icon}>{ICONS.down}</Icon>
						<span class={styles.label}>Close</span>
					</Dialog.CloseTrigger>
				</div>
			</Dialog.Content>
		</Dialog.Root>
	);
}
