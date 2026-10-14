import { Checkbox, Query, Skeleton } from "@j-os/design-system";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex-solidjs";
import { createSignal, For, type JSX, Show } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Category } from "../../../convex/notify/categories.ts";
import { useQuery } from "../data/useQuery.ts";
import { userErrorMessage } from "../userErrorMessage.ts";

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
	isPending: boolean;
	onToggle: (channel: Channel, isChecked: boolean) => void;
}): JSX.Element {
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
					disabled={!props.isPushOn || props.isPending}
					onCheckedChange={(details) => {
						props.onToggle("push", details.checked === true);
					}}
				>
					Push
				</Checkbox>
				<Show when={!props.row.pushOnly}>
					<Checkbox
						checked={props.row.email}
						disabled={props.isPending}
						onCheckedChange={(details) => {
							props.onToggle("email", details.checked === true);
						}}
					>
						Email
					</Checkbox>
				</Show>
			</div>
			<Show when={props.row.note}>
				{(note) => <p class={styles.copy}>{note()}</p>}
			</Show>
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
	const setPref = useMutation(api.notify.prefs.set);
	const [pending, setPending] = createSignal<ReadonlySet<Category>>(
		new Set()
	);
	const [error, setError] = createSignal<string>();

	function rows() {
		return prefs.data() ?? [];
	}

	async function toggle(
		category: Category,
		channel: Channel,
		isChecked: boolean
	): Promise<void> {
		const row = rows().find((candidate) => candidate.category === category);
		if (!row || pending().has(category)) return;
		setPending((prev) => new Set(prev).add(category));
		setError(undefined);
		try {
			await setPref.mutateAsync({
				category,
				push: channel === "push" ? isChecked : row.push,
				email: channel === "email" ? isChecked : row.email,
			});
		} catch (err) {
			setError(userErrorMessage(err, "Could not save that change."));
		} finally {
			setPending((prev) => {
				const next = new Set(prev);
				next.delete(category);
				return next;
			});
		}
	}

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
							<For each={loaded()}>
								{(row) => (
									<CategoryRow
										row={row}
										isPushOn={props.pushOn}
										isPending={pending().has(row.category)}
										onToggle={(channel, isChecked) =>
											void toggle(
												row.category,
												channel,
												isChecked
											)
										}
									/>
								)}
							</For>
						)}
					</Query.Content>
				</Query.Root>
			</Show>
			<Show when={error()}>
				{(message) => <p class={styles.error}>{message()}</p>}
			</Show>
		</div>
	);
}
