import { Accordion, Avatar, Query } from "@j-os/design-system";
import { For, Show, createMemo, type Accessor, type JSX } from "solid-js";

import type { PerkRequestRow } from "../../../convex/perkRequests.ts";
import type { PerkRow } from "../../../convex/perks.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import { formatDate } from "../../shared/time.ts";

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
			<Avatar name={props.request().requesterName} />
			<div class={styles.who}>
				<span class={styles.name}>{props.request().requesterName}</span>
				<span class={styles.email}>
					{props.request().requesterEmail}
				</span>
				<span class={styles.meta}>
					Requested {formatDate(props.request().requestedAt)}
				</span>
				<Show when={props.request().note}>
					{(note) => (
						<p class={`${sheetStyles.note} ${styles.noteText}`}>
							{note()}
						</p>
					)}
				</Show>
			</div>
			<div class={styles.status}>
				<PerkRequestStatusSelect
					requestId={props.request()._id}
					status={props.request().status}
				/>
			</div>
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
			<Accordion.Item value="requests">
				<Accordion.ItemTitle>
					Requests
					<Accordion.ItemSubtitle>
						<Query.Count />
					</Accordion.ItemSubtitle>
				</Accordion.ItemTitle>
				<Accordion.ItemContent>
					<div class={sheetStyles.section}>
						<Query.Empty>
							<p class={styles.empty}>No requests yet.</p>
						</Query.Empty>
						<Query.Content of={requests.data()}>
							{(rows) => <RequestList requests={rows} />}
						</Query.Content>
					</div>
				</Accordion.ItemContent>
			</Accordion.Item>
		</Query.Root>
	);
}
