import { Button, Input, Status } from "@j-os/design-system";
import { useMutation, useQuery } from "convex-solidjs";
import { Show, createSignal, onMount } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { SSID_MAX, WIFI_PASSWORD_MAX } from "../../../convex/lib/validate.ts";
import { useAbility } from "../../lib/ability.tsx";

import { SpaceCard } from "./SpaceCard.tsx";
import styles from "./WifiCard.module.scss";
import { WifiContent } from "./WifiContent.tsx";

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
	const [editing, setEditing] = createSignal(false);
	const [ssidDraft, setSsidDraft] = createSignal("");
	const [passwordDraft, setPasswordDraft] = createSignal("");
	const creds = useQuery(api.wifi.get, {});
	const logWifiOpen = useMutation(api.people.logWifiOpen);
	const updateWifi = useMutation(api.wifi.update);

	// The code is on screen as soon as the card is, so the card rendering is
	// the "first open" the board audit records. Fire-and-forget; the server
	// keeps only the first one.
	onMount(() => {
		void logWifiOpen.mutateAsync({}).catch(() => undefined);
	});

	function canEditWifi(): boolean {
		return ability().can("manage", "Space");
	}

	function startEditing(): void {
		const c = creds.data();
		setSsidDraft(c?.ssid ?? "");
		setPasswordDraft(c?.password ?? "");
		updateWifi.reset();
		setEditing(true);
	}

	function cancelEditing(): void {
		setEditing(false);
		updateWifi.reset();
	}

	function save(): void {
		// `wifi.get` is reactive, so a successful update flows straight back
		// into `creds` — no local cache to reconcile. Errors (e.g. an empty
		// field) stay in `updateWifi.error()` and keep the form open.
		void updateWifi
			.mutateAsync({ ssid: ssidDraft(), password: passwordDraft() })
			.then(() => {
				setEditing(false);
			})
			.catch(() => {
				// Surfaced via updateWifi.error(); nothing further to do here.
			});
	}

	return (
		<SpaceCard
			title="Wi-Fi network"
			helpText="Scan to join the space Wi-Fi network."
			headerAction={
				<Show when={canEditWifi() && !editing()}>
					<Button variant="tertiary" onClick={startEditing}>
						Edit
					</Button>
				</Show>
			}
			note={
				<Show when={!editing()}>
					<p class={styles.hint}>
						Viewing on phone? Use Circle to Search (long-press your
						home button/pill)
					</p>
				</Show>
			}
		>
			<Show
				when={editing()}
				fallback={
					<Show when={creds.data()} keyed>
						{(c) => (
							<WifiContent ssid={c.ssid} password={c.password} />
						)}
					</Show>
				}
			>
				<form
					class={styles.editForm}
					onSubmit={(e) => {
						e.preventDefault();
						save();
					}}
				>
					<Input
						label="Network name"
						maxLength={SSID_MAX}
						value={ssidDraft()}
						onValueChange={(e) =>
							setSsidDraft(e.currentTarget.value)
						}
					/>
					<Input
						label="Password"
						maxLength={WIFI_PASSWORD_MAX}
						value={passwordDraft()}
						onValueChange={(e) =>
							setPasswordDraft(e.currentTarget.value)
						}
					/>
					<Show when={updateWifi.error()}>
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
							onClick={cancelEditing}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							isLoading={updateWifi.isLoading()}
						>
							Save
						</Button>
					</div>
				</form>
			</Show>
		</SpaceCard>
	);
}
