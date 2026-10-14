import { Button, Input, Skeleton, Status } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { Show, createSignal, onMount } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { SSID_MAX, WIFI_PASSWORD_MAX } from "../../../convex/lib/validate.ts";
import { useAbility } from "../../lib/ability.tsx";
import { useQuery } from "../../shared/data/useQuery.ts";

import { SpaceCard } from "./SpaceCard.tsx";
import styles from "./WifiCard.module.scss";
import { WifiContent } from "./WifiContent.tsx";

/** The board's edit form for the network name and password: its drafts,
 *  and the actions that open, cancel and save it. */
function createWifiEditing(credentials: {
	data: () => { ssid: string; password: string } | undefined;
}) {
	const [editing, setEditing] = createSignal(false);
	const [ssidDraft, setSsidDraft] = createSignal("");
	const [passwordDraft, setPasswordDraft] = createSignal("");
	const updateWifi = useMutation(api.wifi.update);

	return {
		editing,
		ssidDraft,
		setSsidDraft,
		passwordDraft,
		setPasswordDraft,
		updateWifi,
		startEditing: (): void => {
			const current = credentials.data();
			setSsidDraft(current?.ssid ?? "");
			setPasswordDraft(current?.password ?? "");
			updateWifi.reset();
			setEditing(true);
		},
		cancelEditing: (): void => {
			setEditing(false);
			updateWifi.reset();
		},
		save: (): void => {
			// `wifi.get` is reactive, so a successful update flows straight
			// back into `credentials` — no local cache to reconcile. Errors
			// (e.g. an empty field) stay in `updateWifi.error()` and keep the
			// form open.
			void updateWifi
				.mutateAsync({ ssid: ssidDraft(), password: passwordDraft() })
				.then(() => {
					setEditing(false);
				})
				.catch(() => {
					// Surfaced via updateWifi.error(); nothing further to do here.
				});
		},
	};
}

function WifiEditForm(props: { edit: ReturnType<typeof createWifiEditing> }) {
	return (
		<form
			class={styles.editForm}
			onSubmit={(event) => {
				event.preventDefault();
				props.edit.save();
			}}
		>
			<Input
				label="Network name"
				maxLength={SSID_MAX}
				value={props.edit.ssidDraft()}
				onValueChange={(event) =>
					props.edit.setSsidDraft(event.currentTarget.value)
				}
			/>
			<Input
				label="Password"
				maxLength={WIFI_PASSWORD_MAX}
				value={props.edit.passwordDraft()}
				onValueChange={(event) =>
					props.edit.setPasswordDraft(event.currentTarget.value)
				}
			/>
			<Show when={props.edit.updateWifi.error()}>
				{(err) => (
					<Status status="error">
						<span>{err().message}</span>
					</Status>
				)}
			</Show>
			<div class={styles.editActions}>
				<Button
					type="button"
					variant="tertiary"
					onClick={props.edit.cancelEditing}
				>
					Cancel
				</Button>
				<Button
					type="submit"
					isLoading={props.edit.updateWifi.isLoading()}
				>
					Save
				</Button>
			</div>
		</form>
	);
}

/**
 * Access-tab card showing a scannable Wi-Fi QR code right in the card.
 * Board/admin additionally get an "Edit" affordance to change the network
 * name and password from here — `api.wifi.update` re-checks `BOARD_LEVEL` on
 * the server regardless, so this gate only shows/hides the control; it grants
 * nothing on its own.
 *
 * Gated on `manage`/`Space`: `Space`'s `view` is granted to every access
 * tier, `manage` only to board/admin.
 */
export function WifiCard() {
	const ability = useAbility();
	const credentials = useQuery(api.wifi.get, {});
	const logWifiOpen = useMutation(api.people.logWifiOpen);
	const edit = createWifiEditing(credentials);

	// The code is on screen as soon as the card is, so the card rendering is
	// the "first open" the board audit records. Fire-and-forget; the server
	// keeps only the first one.
	onMount(() => {
		void logWifiOpen.mutateAsync({}).catch(() => {});
	});

	function canEditWifi(): boolean {
		return ability().can("manage", "Space");
	}

	return (
		<SpaceCard
			title="Wi-Fi network"
			helpText="Scan to join the space Wi-Fi network."
			loading={credentials.data() === undefined}
			skeleton={
				<div class={styles.skeleton} data-wifi-skeleton="">
					<Skeleton class={styles.qrSkeleton} />
					<Skeleton class={styles.ssidSkeleton} />
				</div>
			}
			headerAction={
				<Show when={canEditWifi() && !edit.editing()}>
					<Button variant="tertiary" onClick={edit.startEditing}>
						Edit
					</Button>
				</Show>
			}
			note={
				<Show when={!edit.editing()}>
					<p class={styles.hint}>
						Viewing on phone? Use Circle to Search (long-press your
						home button/pill)
					</p>
				</Show>
			}
		>
			<Show
				when={edit.editing()}
				fallback={
					<Show when={credentials.data()} keyed>
						{(current) => (
							<WifiContent
								ssid={current.ssid}
								password={current.password}
							/>
						)}
					</Show>
				}
			>
				<WifiEditForm edit={edit} />
			</Show>
		</SpaceCard>
	);
}
