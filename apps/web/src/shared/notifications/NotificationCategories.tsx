import { Checkbox, Query, Skeleton } from "@j-os/design-system";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex-solidjs";
import { createSignal, For, type JSX, Show } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Category } from "../../../convex/notify/categories.ts";
import { call } from "../../lib/call.ts";
import { createActionError } from "../createActionError.ts";
import { useQuery } from "../data/useQuery.ts";
import { InlineError } from "../InlineError.tsx";

import styles from "./NotificationCategories.module.scss";

const PREFS_FAILED_COPY = "Couldn't load notification settings.";

const PUSH_OFF_HINT =
	"Turn on push notifications above to choose what gets pushed here.";

type Channel = "push" | "email";

function labelId(category: Category): string {
	return `notification-category-${category}`;
}

type CategoryPrefRow = FunctionReturnType<typeof api.notify.prefs.mine>[number];

function CategoryRow(props: {
	row: CategoryPrefRow;
	isPushOn: boolean;
}): JSX.Element {
	const setPref = useMutation(api.notify.prefs.set);
	const [isPending, setIsPending] = createSignal(false);
	const { error, trackResult } = createActionError();

	async function toggle(channel: Channel, isChecked: boolean): Promise<void> {
		if (isPending()) return;
		setIsPending(true);
		await trackResult(
			call(
				setPref.mutateAsync({
					category: props.row.category,
					push: channel === "push" ? isChecked : props.row.push,
					email: channel === "email" ? isChecked : props.row.email,
				}),
				"Could not save that change."
			)
		);
		setIsPending(false);
	}

	return (
		<div
			class={styles.category}
			role="group"
			aria-labelledby={labelId(props.row.category)}
		>
			<p id={labelId(props.row.category)} class={styles.label}>
				{props.row.label}
			</p>
			<p class={styles.copy}>{props.row.description}</p>
			<div class={styles.channels}>
				<Checkbox
					checked={props.row.push}
					disabled={!props.isPushOn || isPending()}
					onCheckedChange={(details) => {
						void toggle("push", details.checked === true);
					}}
				>
					Push
				</Checkbox>
				<Show when={!props.row.pushOnly}>
					<Checkbox
						checked={props.row.email}
						disabled={isPending()}
						onCheckedChange={(details) => {
							void toggle("email", details.checked === true);
						}}
					>
						Email
					</Checkbox>
				</Show>
			</div>
			<Show when={props.row.note}>
				{(note) => <p class={styles.copy}>{note()}</p>}
			</Show>
			<InlineError message={error()} />
		</div>
	);
}

/**
 * The drawer's Categories tab: one card per category with its Push and Email
 * checkboxes. Push checkboxes are locked while push is off on this device
 * (`pushOn`); email reaches the person regardless, so Email stays editable.
 */
export function NotificationCategories(props: {
	pushOn: boolean;
}): JSX.Element {
	const prefs = useQuery(api.notify.prefs.mine, {});

	return (
		<div class={styles.categories}>
			<Show
				when={prefs.error() === undefined}
				fallback={<p class={styles.copy}>{PREFS_FAILED_COPY}</p>}
			>
				<Show when={!props.pushOn}>
					<p class={styles.copy}>{PUSH_OFF_HINT}</p>
				</Show>
				<Query.Root data={prefs.data()}>
					<Query.Skeleton>
						<Skeleton width="long" />
					</Query.Skeleton>
					<Query.Content of={prefs.data()}>
						{(loaded) => (
							<For each={loaded().map((row) => row.category)}>
								{(category) => (
									<Show
										when={loaded().find(
											(row) => row.category === category
										)}
									>
										{(row) => (
											<CategoryRow
												row={row()}
												isPushOn={props.pushOn}
											/>
										)}
									</Show>
								)}
							</For>
						)}
					</Query.Content>
				</Query.Root>
			</Show>
		</div>
	);
}
