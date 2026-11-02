import { EmptyState, Query } from "@j-os/design-system";
import { For, Show, createMemo, type Accessor, type JSX } from "solid-js";

import { SITE_TIMEZONE } from "../../../convex/lib/time.ts";
import type { PerkRequestRow } from "../../../convex/perkRequests.ts";
import type { PerkRow } from "../../../convex/perks.ts";
import { PersonListItem } from "../../shared/components/PersonListItem.tsx";
import { useQuery } from "../../shared/data/useQuery.ts";
import { SheetSection } from "../../shared/entity/SheetSection.tsx";
import { formatDateIn } from "../../shared/time.ts";

import styles from "./PerkAdminRequests.module.scss";
import { PerkRequestStatusSelect } from "./PerkRequestStatusSelect.tsx";
import sheetStyles from "./PerkSheet.module.scss";
import { perkRequestsForPerkQuery } from "./queries.ts";

/** One request: who asked and when, what they wrote, and its status, which
 *  the board moves from here. */
function RequestItem(props: {
	request: Accessor<PerkRequestRow>;
}): JSX.Element {
	return (
		<li class={styles.request}>
			<PersonListItem
				name={props.request().requesterName}
				detail={props.request().requesterEmail}
			>
				<span class={styles.requested}>
					Requested{" "}
					{formatDateIn(props.request().requestedAt, SITE_TIMEZONE)}
				</span>
				<PerkRequestStatusSelect
					requestId={props.request()._id}
					status={props.request().status}
				/>
			</PersonListItem>
			<Show when={props.request().note}>
				{(note) => (
					<p class={`${sheetStyles.note} ${styles.noteText}`}>
						{note()}
					</p>
				)}
			</Show>
		</li>
	);
}

/** The requests, keyed by id: a live update hands over new row objects, and
 *  each request's item updates in place, so an open picker, a refusal under
 *  it and the focus survive a change to any request. */
function RequestList(props: {
	requests: Accessor<PerkRequestRow[]>;
}): JSX.Element {
	const byId = createMemo(
		() => new Map(props.requests().map((request) => [request._id, request]))
	);
	return (
		<ul class={styles.requests}>
			<For each={[...byId().keys()]}>
				{(id) => (
					<Show when={byId().get(id)}>
						{(request) => <RequestItem request={request} />}
					</Show>
				)}
			</For>
		</ul>
	);
}

/**
 * The board's "Requests" section of a perk's sheet: everyone who asked for
 * it, newest first, each with a status picker. Mount it only for
 * `manage`/`Perks`, so the query runs for the board alone (the server
 * refuses everyone else too). Never shows the previous perk's requests while
 * the next one's load.
 */
export function PerkAdminRequests(props: {
	perk: Accessor<PerkRow>;
}): JSX.Element {
	const requests = useQuery(
		perkRequestsForPerkQuery.query,
		() => perkRequestsForPerkQuery.args(props.perk()._id),
		{ keepPreviousData: false }
	);
	return (
		<Query.Root data={requests.data()}>
			<SheetSection
				value="requests"
				title="Requests"
				subtitle={<Query.Count />}
			>
				<Query.Empty>
					<EmptyState title="No requests yet" />
				</Query.Empty>
				<Query.Content of={requests.data()}>
					{(rows) => <RequestList requests={rows} />}
				</Query.Content>
			</SheetSection>
		</Query.Root>
	);
}
