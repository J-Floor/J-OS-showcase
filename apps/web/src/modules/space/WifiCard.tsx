import { Input, Skeleton } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { Show, createSignal, onMount, type Accessor } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { SSID_MAX, WIFI_PASSWORD_MAX } from "../../../convex/lib/validate.ts";
import type { Wifi } from "../../../convex/lib/wifi.ts";
import { useAbility } from "../../lib/ability.tsx";
import { call, ignoreFailure } from "../../lib/call.ts";
import { ActionButton } from "../../shared/actions/ActionButton.tsx";
import { ActionForm } from "../../shared/actions/ActionForm.tsx";
import { createActionKeys } from "../../shared/actions/createActionKeys.ts";
import type { ActionDescriptor } from "../../shared/actions/shortcuts.ts";
import { createActionError } from "../../shared/createActionError.ts";
import { useQuery } from "../../shared/data/useQuery.ts";
import { ICONS } from "../../shared/icons.ts";
import { InlineError } from "../../shared/InlineError.tsx";

import { SpaceCard } from "./SpaceCard.tsx";
import { WIFI_TARGET, type WifiTarget } from "./wifi.ts";
import styles from "./WifiCard.module.scss";
import { WifiContent } from "./WifiContent.tsx";

/** The board's edit form for the network name and password: its drafts,
 *  and the actions that open, cancel and save it. */
function createWifiEditing(credentials: { data: Accessor<Wifi | undefined> }) {
	const [editing, setEditing] = createSignal(false);
	const [ssidDraft, setSsidDraft] = createSignal("");
	const [passwordDraft, setPasswordDraft] = createSignal("");
	const { error, trackResult, clear } = createActionError();
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
			clear();
			setEditing(true);
		},
		cancelEditing: (): void => {
			setEditing(false);
			updateWifi.reset();
			clear();
		},
		error,
		save: async (): Promise<void> => {
			// `wifi.get` is reactive, so a successful update flows straight
			// back into `credentials` — no local cache to reconcile. A failure
			// (e.g. an empty field) shows in the form, which stays open.
			const result = await trackResult(
				call(
					updateWifi.mutateAsync({
						ssid: ssidDraft(),
						password: passwordDraft(),
					}),
					"Could not save the Wi-Fi details."
				)
			);
			if (result.isErr()) return;
			setEditing(false);
		},
	};
}

const WIFI_SCOPE = "space-wifi-edit";

/** The card's actions and their keys: Edit (`E`) opens the form; Save
 *  (`Mod+Enter`) and Cancel (`Escape`) type nothing, so they work from
 *  inside its fields. */
function createWifiActions(options: {
	edit: ReturnType<typeof createWifiEditing>;
	canEdit: () => boolean;
	active: () => boolean;
}) {
	const { edit } = options;
	const startEdit: ActionDescriptor<WifiTarget> = {
		id: "edit-wifi",
		label: "Edit",
		icon: ICONS.edit,
		hotkey: "E",
		can: () => options.canEdit() && !edit.editing(),
		run: () => {
			edit.startEditing();
		},
	};
	const save: ActionDescriptor<WifiTarget> = {
		id: "save-wifi",
		label: "Save",
		icon: ICONS.check,
		hotkey: "Mod+Enter",
		can: () => edit.editing(),
		run: async () => {
			await edit.save();
			return { refused: edit.error() !== null };
		},
	};
	const cancel: ActionDescriptor<WifiTarget> = {
		id: "cancel-wifi",
		label: "Cancel",
		icon: ICONS.close,
		hotkey: "Escape",
		can: () => edit.editing(),
		run: () => {
			edit.cancelEditing();
		},
	};
	createActionKeys<WifiTarget>({
		scope: WIFI_SCOPE,
		actions: () => [startEdit, save, cancel],
		target: () => WIFI_TARGET,
		active: options.active,
	});
	return { startEdit, save, cancel };
}

type WifiActions = ReturnType<typeof createWifiActions>;

function WifiEditForm(props: {
	edit: ReturnType<typeof createWifiEditing>;
	actions: WifiActions;
}) {
	return (
		<ActionForm
			class={styles.editForm}
			action={props.actions.save}
			target={WIFI_TARGET}
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
			<InlineError message={props.edit.error()} />
			<div class={styles.editActions}>
				<ActionButton
					action={props.actions.cancel}
					target={WIFI_TARGET}
					variant="tertiary"
				/>
				<ActionButton
					action={props.actions.save}
					target={WIFI_TARGET}
				/>
			</div>
		</ActionForm>
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
export function WifiCard(props: { active?: boolean }) {
	const ability = useAbility();
	const credentials = useQuery(api.wifi.get, {});
	const logWifiOpen = useMutation(api.people.logWifiOpen);
	const edit = createWifiEditing(credentials);

	// The code is on screen as soon as the card is, so the card rendering is
	// the "first open" the board audit records. Fire-and-forget; the server
	// keeps only the first one.
	onMount(() => {
		// The audit log is best effort: a failure has nobody to tell.
		ignoreFailure(logWifiOpen.mutateAsync({}));
	});

	function canEditWifi(): boolean {
		return ability().can("manage", "Space");
	}

	const actions = createWifiActions({
		edit,
		canEdit: canEditWifi,
		// Only while the card is on screen, and not before its details load.
		active: () => props.active === true && credentials.data() !== undefined,
	});

	return (
		<SpaceCard.Root loading={credentials.data() === undefined}>
			<SpaceCard.Header title="Wi-Fi network">
				<SpaceCard.Action>
					<Show when={canEditWifi() && !edit.editing()}>
						<ActionButton
							action={actions.startEdit}
							target={WIFI_TARGET}
							variant="tertiary"
						/>
					</Show>
				</SpaceCard.Action>
			</SpaceCard.Header>
			<SpaceCard.Help>
				Scan to join the space Wi-Fi network.
			</SpaceCard.Help>
			<SpaceCard.Body>
				<Show
					when={edit.editing()}
					fallback={
						<Show when={credentials.data()} keyed>
							{(current) => (
								<WifiContent
									{...current}
									keysActive={props.active === true}
								/>
							)}
						</Show>
					}
				>
					<WifiEditForm edit={edit} actions={actions} />
				</Show>
			</SpaceCard.Body>
			<SpaceCard.Note>
				<Show when={!edit.editing()}>
					<p class={styles.hint}>
						Viewing on phone? Use Circle to Search (long-press your
						home button/pill)
					</p>
				</Show>
			</SpaceCard.Note>
			<SpaceCard.Skeleton>
				<div class={styles.skeleton} data-wifi-skeleton="">
					<Skeleton class={styles.qrSkeleton} />
					<Skeleton class={styles.ssidSkeleton} />
				</div>
			</SpaceCard.Skeleton>
		</SpaceCard.Root>
	);
}
