import {
	Button,
	EmptyState,
	FloatingToolbar,
	Icon,
	Table,
} from "@j-os/design-system";
import { Show } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Can } from "../../lib/ability.tsx";
import { useQuery } from "../../shared/data/useQuery.ts";
import { createEntitySelection } from "../../shared/entity/createEntitySelection.ts";
import { useRowPrefetch } from "../../shared/entity/useRowPrefetch.ts";
import { ICONS } from "../../shared/icons.ts";

import { eventsEntity } from "./entity.ts";
import { EVENTS_DEFAULT_SORT, eventColumns } from "./eventColumns.tsx";
import { EventSheet } from "./EventSheet.tsx";
import styles from "./EventsPage.module.scss";

/**
 * Events module: a table of events (read-only for any member with space
 * access), with a board/admin "New event" action and a row-detail sheet.
 * Same shell as the Community console — no page title of its own (the sidebar
 * labels it); the top bar holds the primary action on the right, floating
 * over the page on a phone.
 */
export function EventsPage() {
	const events = useQuery(api.events.listEvents, {});
	const prefetchRow = useRowPrefetch(eventsEntity);

	const { selected, loading, open, openRow, openCreate, close } =
		createEntitySelection<Doc<"events">>({
			rows: events.data,
			param: "event",
		});

	return (
		<div class={styles.console}>
			<div class={styles.bar}>
				<Can I="create" the="Events">
					<FloatingToolbar>
						<Button onClick={openCreate}>
							<Icon>{ICONS.add}</Icon> New event
						</Button>
					</FloatingToolbar>
				</Can>
			</div>
			<div class={styles.panel}>
				<Show
					when={events.data()?.length !== 0}
					fallback={
						<EmptyState
							icon={ICONS.events}
							title="No events yet"
							description="Create one to get a visitor QR code."
						/>
					}
				>
					<Table.Root
						columns={eventColumns()}
						data={events.data()}
						getRowId={(row) => row._id}
						initialColumnSorting={EVENTS_DEFAULT_SORT}
						groupBy="phase"
						focusableRows
						suppressFocus={open()}
						onRowClick={openRow}
						onRowActivate={openRow}
						onRowHoverIntent={prefetchRow}
						onFocusedRowChange={prefetchRow}
					/>
				</Show>
			</div>
			<EventSheet
				open={open()}
				onOpenChange={(isOpen) => {
					if (!isOpen) close();
				}}
				event={selected()}
				loading={loading()}
			/>
		</div>
	);
}
