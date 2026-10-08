import { Checkbox, Skeleton } from "@j-os/design-system";
import { useMutation, useQuery } from "convex-solidjs";
import { createSignal, For, type JSX, Show } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Category } from "../../../convex/notify/categories.ts";
import { userErrorMessage } from "../userErrorMessage.ts";

import styles from "./NotificationCategories.module.scss";

const PREFS_FAILED_COPY = "Couldn't load notification settings.";

const PUSH_OFF_HINT =
	"Turn on push notifications above to choose what gets pushed here.";

type Channel = "push" | "email";

function labelId(category: Category): string {
	return `notification-category-${category}`;
}

/**
 * The drawer's Categories tab: one card per category with its Push and Email
 * checkboxes. Push checkboxes are locked while push is off on this device
 * (`pushOn`); email reaches the person regardless, so Email stays editable.
 */
export function NotificationCategories(props: {
	pushOn: boolean;
}): JSX.Element {
	const prefs = useQuery(
		api.notify.prefs.mine,
		{},
		{ keepPreviousData: true }
	);
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
		checked: boolean
	): Promise<void> {
		const row = rows().find((r) => r.category === category);
		if (!row || pending().has(category)) return;
		setPending((prev) => new Set(prev).add(category));
		setError(undefined);
		try {
			await setPref.mutateAsync({
				category,
				push: channel === "push" ? checked : row.push,
				email: channel === "email" ? checked : row.email,
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
				<Show
					when={prefs.data() !== undefined}
					fallback={<Skeleton width="long" />}
				>
					<For each={rows()}>
						{(row) => (
							<div
								class={styles.category}
								role="group"
								aria-labelledby={labelId(row.category)}
							>
								<p
									id={labelId(row.category)}
									class={styles.label}
								>
									{row.label}
								</p>
								<p class={styles.copy}>{row.description}</p>
								<div class={styles.channels}>
									<Checkbox
										checked={row.push}
										disabled={
											!props.pushOn ||
											pending().has(row.category)
										}
										onCheckedChange={(d) => {
											void toggle(
												row.category,
												"push",
												d.checked === true
											);
										}}
									>
										Push
									</Checkbox>
									<Show when={!row.pushOnly}>
										<Checkbox
											checked={row.email}
											disabled={pending().has(
												row.category
											)}
											onCheckedChange={(d) => {
												void toggle(
													row.category,
													"email",
													d.checked === true
												);
											}}
										>
											Email
										</Checkbox>
									</Show>
								</div>
								<Show when={row.note}>
									{(note) => (
										<p class={styles.copy}>{note()}</p>
									)}
								</Show>
							</div>
						)}
					</For>
				</Show>
			</Show>
			<Show when={error()}>
				{(message) => <p class={styles.error}>{message()}</p>}
			</Show>
		</div>
	);
}
