import { Button, EmptyState, Icon, Table } from "@j-os/design-system";
import { useQuery } from "convex-solidjs";
import { Show } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Can } from "../../lib/ability.tsx";
import { createEntitySelection } from "../../shared/entity/createEntitySelection.ts";
import { ICONS } from "../../shared/icons.ts";

import { eventColumns } from "./eventColumns.tsx";
import { EventDrawer } from "./EventDrawer.tsx";
import styles from "./EventsPage.module.scss";

/**
 * Events module: a table of events (read-only for any member with space
 * access), with a board/admin "New event" action and a row-detail drawer.
 * Same shell as the Community console — no page title of its own (the sidebar
 * labels it); the top bar holds the primary action on the right.
 */
export function EventsPage() {
	const events = useQuery(
		api.events.listEvents,
		{},
		{ keepPreviousData: true }
	);

	const { selected, loading, open, openRow, openCreate, close } =
		createEntitySelection<Doc<"events">>({
			rows: events.data,
			param: "event",
		});

	return (
		<div class={styles.console}>
			<div class={styles.bar}>
				<Can I="create" the="Events">
					<Button onClick={openCreate}>
						<Icon>{ICONS.add}</Icon> New event
					</Button>
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
						groupBy="phase"
						focusableRows
						suppressFocus={open()}
						onRowClick={openRow}
						onRowActivate={openRow}
					/>
				</Show>
			</div>
			<EventDrawer
				open={open()}
				onOpenChange={(v) => {
					if (!v) close();
				}}
				event={selected()}
				loading={loading()}
			/>
		</div>
	);
}
