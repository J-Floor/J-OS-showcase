import { Sheet, SheetNav, IconButton } from "@j-os/design-system";
import { Show } from "solid-js";

import { ICONS } from "../icons.ts";

/** Prev/next over the rows the tab is displaying. */
export type SheetNavState = {
	hasPrev: () => boolean;
	hasNext: () => boolean;
	onPrev: () => void;
	onNext: () => void;
};

/** The title, prev/next, a delete button for an existing row, and close. */
export function EntitySheetHeader(props: {
	title: string;
	loading?: boolean;
	nav?: SheetNavState;
	isEdit: boolean;
	deleteLabel: string;
	onDelete: () => void;
}) {
	return (
		<Sheet.Header>
			<Sheet.Title loading={props.loading}>{props.title}</Sheet.Title>
			<Sheet.HeaderActions>
				<Show when={props.nav}>
					{(nav) => (
						<SheetNav
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
				<Sheet.Close />
			</Sheet.HeaderActions>
		</Sheet.Header>
	);
}
