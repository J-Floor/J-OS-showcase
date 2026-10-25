import { Sheet, SheetNav, IconButton } from "@j-os/design-system";
import { Show, type JSX } from "solid-js";

import type { SheetNavState } from "../../lib/createSheetNav.ts";
import { ICONS } from "../icons.ts";

/** The title, the save status, prev/next, the caller's own actions (its
 *  `Delete`, an edit toggle) and close. */
function Root(props: {
	title: string;
	loading?: boolean;
	nav?: SheetNavState;
	/** Shows what the fields have saved: an existing row's sheet, never a
	 *  create form's. */
	saveStatus?: boolean;
	children?: JSX.Element;
}): JSX.Element {
	return (
		<Sheet.Header>
			<Sheet.Title loading={props.loading}>{props.title}</Sheet.Title>
			<Sheet.HeaderActions>
				<Show when={props.saveStatus}>
					<Sheet.SaveStatus />
				</Show>
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
				{props.children}
				<Sheet.Close />
			</Sheet.HeaderActions>
		</Sheet.Header>
	);
}

/** The delete button for an existing row. */
function Delete(props: { label: string; onDelete: () => void }): JSX.Element {
	return (
		<IconButton
			tooltipLabel={props.label}
			onClick={() => {
				props.onDelete();
			}}
		>
			{ICONS.delete}
		</IconButton>
	);
}

export const EntitySheetHeader = { Root, Delete };
