import { Drawer, DrawerNav, IconButton } from "@j-os/design-system";
import { Show } from "solid-js";

import { ICONS } from "../icons.ts";

/** Prev/next over the rows the tab is displaying. */
export type DrawerNavState = {
	hasPrev: () => boolean;
	hasNext: () => boolean;
	onPrev: () => void;
	onNext: () => void;
};

/** The title, prev/next, a delete button for an existing row, and close. */
export function EntityDrawerHeader(props: {
	title: string;
	loading?: boolean;
	nav?: DrawerNavState;
	isEdit: boolean;
	deleteLabel: string;
	onDelete: () => void;
}) {
	return (
		<Drawer.Header>
			<Drawer.Title loading={props.loading}>{props.title}</Drawer.Title>
			<Drawer.HeaderActions>
				<Show when={props.nav}>
					{(nav) => (
						<DrawerNav
							onPrev={nav().onPrev}
							onNext={nav().onNext}
							hasPrev={nav().hasPrev()}
							hasNext={nav().hasNext()}
						/>
					)}
				</Show>
				<Show when={props.isEdit}>
					<IconButton
						tooltipLabel={props.deleteLabel}
						onClick={() => {
							props.onDelete();
						}}
					>
						{ICONS.delete}
					</IconButton>
				</Show>
				<Drawer.Close />
			</Drawer.HeaderActions>
		</Drawer.Header>
	);
}
