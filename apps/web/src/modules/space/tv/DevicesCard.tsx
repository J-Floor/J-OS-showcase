import { Badge, EmptyState, IconButton } from "@j-os/design-system";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex-solidjs";
import { createMemo, createSignal, For, Show, type JSX } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { call } from "../../../lib/call.ts";
import { useConfirm } from "../../../shared/confirm.tsx";
import { createActionError } from "../../../shared/createActionError.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import { formatAgo } from "../../../shared/time.ts";
import { SpaceCard } from "../SpaceCard.tsx";

import styles from "./DevicesCard.module.scss";
import { ScheduleSheet } from "./ScheduleSheet.tsx";

const REVOKE_FAILED = "Could not revoke the TV. Try again.";

function lastSeenText(lastSeenAt: number | undefined): string {
	return lastSeenAt === undefined
		? "Not seen yet"
		: `Last seen ${formatAgo(lastSeenAt)}`;
}

type Device = FunctionReturnType<typeof api.tv.listDevices>[number];

function DeviceRow(props: {
	device: Device;
	onSchedule: () => void;
	onRevoke: () => void;
}): JSX.Element {
	return (
		<li class={styles.row}>
			<span class={styles.label}>
				{props.device.label}
				<Show when={props.device.schedule}>
					<span class={styles.custom}>Custom hours</span>
				</Show>
			</span>
			<span class={styles.seen}>
				{lastSeenText(props.device.lastSeenAt)}
			</span>
			<Show
				when={props.device.revokedAt === undefined}
				fallback={<Badge status="neutral">Revoked</Badge>}
			>
				<IconButton
					tooltipLabel={`Schedule for ${props.device.label}`}
					onClick={props.onSchedule}
				>
					{ICONS.time}
				</IconButton>
				<IconButton
					tooltipLabel={`Revoke ${props.device.label}`}
					onClick={props.onRevoke}
				>
					{ICONS.delete}
				</IconButton>
			</Show>
		</li>
	);
}

/**
 * The TVs the board connected, live ones and recently revoked ones. There is
 * no way to add one here: a TV is connected only from its own screen (it
 * shows a QR code that a member scans), so this card only explains that and
 * lets the board cut a TV off.
 */
export function DevicesCard(): JSX.Element {
	const devices = useQuery(api.tv.listDevices, {});
	const revokeDevice = useMutation(api.tv.revokeDevice);
	const confirm = useConfirm();
	const { error, trackResult } = createActionError();
	// The id, not the row: the sheet reads the live row, and the id is kept
	// after closing so the sheet can finish its exit.
	const [scheduleId, setScheduleId] = createSignal<Id<"tvDevices">>();
	const [isScheduleOpen, setIsScheduleOpen] = createSignal(false);
	const scheduled = createMemo(() =>
		devices.data()?.find((device) => device._id === scheduleId())
	);

	async function revoke(id: Id<"tvDevices">, label: string): Promise<void> {
		const isConfirmed = await confirm({
			title: `Revoke ${label}?`,
			message: "This TV stops showing slides until it is set up again.",
			confirmLabel: "Revoke",
			tone: "danger",
		});
		if (!isConfirmed) return;
		await trackResult(
			call(revokeDevice.mutateAsync({ id }), REVOKE_FAILED)
		);
	}

	return (
		<SpaceCard.Root loading={devices.data() === undefined}>
			<SpaceCard.Header title="TVs" />
			<SpaceCard.Skeleton />
			<SpaceCard.Body>
				<div class={styles.body}>
					<p class={styles.note}>
						Open the TV app to show a QR code, then scan it with
						your phone.
					</p>
					<Show
						when={(devices.data() ?? []).length > 0}
						fallback={
							<EmptyState icon={ICONS.empty} title="No TVs yet" />
						}
					>
						<ul class={styles.list}>
							<For each={devices.data()}>
								{(device) => (
									<DeviceRow
										device={device}
										onSchedule={() => {
											setScheduleId(device._id);
											setIsScheduleOpen(true);
										}}
										onRevoke={() => {
											void revoke(
												device._id,
												device.label
											);
										}}
									/>
								)}
							</For>
						</ul>
					</Show>
					<InlineError message={error()} />
				</div>
				<Show when={scheduled()}>
					{(device) => (
						<ScheduleSheet
							open={isScheduleOpen()}
							onOpenChange={setIsScheduleOpen}
							device={device()}
						/>
					)}
				</Show>
			</SpaceCard.Body>
		</SpaceCard.Root>
	);
}
