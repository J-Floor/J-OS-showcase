import {
	Button,
	Confetti,
	DatePicker,
	Dialog,
	Segment,
} from "@j-os/design-system";
import { ok, type Result } from "neverthrow";
import {
	type JSX,
	type ParentProps,
	Show,
	createContext,
	createSignal,
	useContext,
} from "solid-js";

import type { Id } from "../../../../convex/_generated/dataModel";
import { invariant } from "../../../../convex/lib/result.ts";
import {
	composeExpiry,
	minExpiryIso,
	SITE_TIMEZONE,
} from "../../../../convex/lib/time.ts";
import type { ClientError } from "../../../lib/call.ts";
import { createActionError } from "../../../shared/createActionError.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import { HostSelect } from "../columns/HostSelect.tsx";

import styles from "./guestExpiry.module.scss";
import { useTriage } from "./triage.ts";

/** Opens the "Set expiry" dialog for the given applications; on confirm each is
 * approved as a guest with the chosen expiry. */
type RequestGuestExpiry = (applicationIds: Id<"people">[]) => void;

const GuestExpiryContext = createContext<RequestGuestExpiry>();

export function useGuestExpiry(): RequestGuestExpiry {
	const context = useContext(GuestExpiryContext);
	invariant(
		context,
		"useGuestExpiry must be used within <GuestExpiryProvider>"
	);
	return context;
}

function DoorAccessChoice(props: {
	isAllowed: boolean;
	onChange: (isAllowed: boolean) => void;
}): JSX.Element {
	return (
		<div class={styles.door}>
			<span class={styles.doorLabel}>Allow door access</span>
			<Segment.Root
				// Two options in a full-width dialog: side by
				// side reads as the switch this is, where the
				// stacked default reads as a list of choices.
				orientation="horizontal"
				class={styles.doorSegment}
				value={props.isAllowed ? "yes" : "no"}
				onValueChange={(details) => {
					props.onChange(details.value === "yes");
				}}
			>
				<Segment.Item value="yes">Yes</Segment.Item>
				<Segment.Item value="no">No</Segment.Item>
			</Segment.Root>
			{/* "Yes" is not an override — it leaves the lock
		    following their access window, which is what
		    approving a guest has always done. */}
			<span class={styles.doorHint}>
				{props.isAllowed
					? "The app opens the doors for them for as long as their access window lasts."
					: "The app will not open the doors for them. A board member can allow it later from their sheet."}
			</span>
		</div>
	);
}

function GuestExpiryFooter(props: {
	isSaving: boolean;
	hasHost: boolean;
	onConfirm: () => void;
}): JSX.Element {
	return (
		<div class={styles.footer}>
			<Dialog.CloseTrigger
				asChild={(closeProps) => (
					<Button {...(closeProps() as object)} variant="tertiary">
						Cancel
					</Button>
				)}
			/>
			<Confetti>
				<Button
					isLoading={props.isSaving}
					disabled={!props.hasHost}
					disabledReason="Choose a host first"
					onClick={props.onConfirm}
				>
					Grant guest access
				</Button>
			</Confetti>
		</div>
	);
}

// Land the caret on the Host field — the one required input and the
// thing this dialog is here to ask. Without this, `Dialog.Root`
// self-focuses its content (right for a dialog with no obvious
// first field, wrong here), so opening it — by the `G` shortcut or
// a click — left focus on the panel. The Host `Select`'s own
// `autofocus` cannot win: the dialog's focus trap applies after it.
function hostSelectTrigger(): HTMLElement | null {
	return (
		document
			.querySelector(
				'[data-scope="dialog"][data-part="content"][data-state="open"]'
			)
			?.querySelector<HTMLElement>(
				'[data-scope="select"][data-part="trigger"]'
			) ?? null
	);
}

/** Approve each application in turn; the first refusal ends the run. */
async function approveAll(
	approveAsGuest: ReturnType<typeof useTriage>["approveAsGuest"],
	ids: Id<"people">[],
	grant: {
		until: number | undefined;
		hostedById: Id<"people">;
		shouldBlockDoor: boolean;
		/** Called as each one is approved, so a retry skips it. */
		onApproved: (id: Id<"people">) => void;
	}
): Promise<Result<unknown, ClientError>> {
	for (const id of ids) {
		const result = await approveAsGuest(
			id,
			grant.until,
			grant.hostedById,
			grant.shouldBlockDoor
		);
		if (result.isErr()) return result;
		grant.onApproved(id);
	}
	return ok(undefined);
}

/**
 * Provides the make-guest flow: any descendant calls `useGuestExpiry()(ids)` to
 * open a dialog asking for an expiry date, then approves each application as a
 * guest with that access window. Renders the dialog itself.
 */
export function GuestExpiryProvider(props: ParentProps): JSX.Element {
	const { approveAsGuest } = useTriage();
	const [open, setOpen] = createSignal(false);
	const [ids, setIds] = createSignal<Id<"people">[]>([]);
	const [iso, setIso] = createSignal<string | null>(null);
	const [saving, setSaving] = createSignal(false);
	const { error, trackResult, clear } = createActionError();
	const [host, setHost] = createSignal<Id<"people"> | null>(null);
	// Default yes, which is what approving a guest has always done: the lock
	// simply follows their access window. "No" is the new capability, and it is
	// the one worth making the board choose deliberately.
	const [doorAllowed, setDoorAllowed] = createSignal(true);

	function request(applicationIds: Id<"people">[]): void {
		setIds(applicationIds);
		clear();
		setIso(null);
		setHost(null);
		setDoorAllowed(true);
		setOpen(true);
	}

	async function confirm() {
		if (saving()) return;
		const chosenHost = host();
		// The HOST is required — a guest without one has nobody to ask when
		// something goes wrong. The DATE is not: leaving it empty grants
		// open-ended access, which is what this dialog did before the lifecycle
		// cutover and what the board still needs for a resident with no end date
		// in sight. `composeExpiry(null, ...)` is null, which `approveAsGuest`
		// sends as an absent `until`.
		if (!chosenHost) return;
		const until = composeExpiry(iso(), SITE_TIMEZONE)?.utc;
		setSaving(true);
		const result = await trackResult(
			approveAll(approveAsGuest, ids(), {
				until,
				hostedById: chosenHost,
				shouldBlockDoor: !doorAllowed(),
				onApproved: (id) =>
					setIds((rest) => rest.filter((x) => x !== id)),
			})
		);
		setSaving(false);
		if (result.isOk()) setOpen(false);
	}

	return (
		<GuestExpiryContext.Provider value={request}>
			{props.children}
			<Dialog.Root
				open={open()}
				onOpenChange={(details) => setOpen(details.open)}
				initialFocusEl={hostSelectTrigger}
			>
				<Dialog.Content>
					<Dialog.Title>Guest configuration</Dialog.Title>
					<Dialog.Description>
						Guest access runs through the end of the expiry date
						(Europe/Zurich). Leave the date empty for open-ended
						access. Only the host is required.
					</Dialog.Description>
					{/* Mount only while open so closing the dialog also closes
					    the calendar popover (its own portal) and resets the
					    field for the next use. */}
					<Show when={open()}>
						<HostSelect
							label="Host"
							value={host()}
							onCommit={setHost}
						/>
						<DatePicker
							label="Expiry date (optional)"
							minIso={minExpiryIso(SITE_TIMEZONE)}
							onValueChange={setIso}
						/>
						<DoorAccessChoice
							isAllowed={doorAllowed()}
							onChange={setDoorAllowed}
						/>
					</Show>
					<InlineError message={error()} />
					<GuestExpiryFooter
						isSaving={saving()}
						hasHost={host() !== null}
						onConfirm={() => void confirm()}
					/>
				</Dialog.Content>
			</Dialog.Root>
		</GuestExpiryContext.Provider>
	);
}
