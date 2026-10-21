import { Button, EditableText, PropertyRow } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { Show } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { call } from "../../../lib/call.ts";
import {
	createActionError,
	scopeOfFields,
	type ActionErrorState,
} from "../../../shared/createActionError.ts";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import { HostSelect } from "../columns/HostSelect.tsx";
import {
	CompanyField,
	DescriptionRow,
	FundingStageField,
	PastBuiltField,
	PhoneField,
	ProductStageField,
	ReferralField,
	VerticalField,
	WhyJoinField,
} from "../ProfileFields.tsx";

import styles from "./PersonDetail.module.scss";

/** The email row, which has its own flow: the stored address stays until the
 * new one confirms, and a refused change shows its reason beside the field. */
function EmailEditor(props: { person: Doc<"people"> }) {
	function person() {
		return props.person;
	}
	const update = useMutation(api.people.update);
	const cancelEmailChange = useMutation(api.people.cancelEmailChange);
	// The stored email stays until the new address confirms
	// (`people.confirmEmailChange`); until then the change is pending here.
	const pendingEmail = useQuery(
		api.people.pendingEmailChange,
		() => ({ personId: person()._id }),
		{ keepPreviousData: false }
	);
	// The drawer is re-used as the board steps through rows, so a clash error
	// for one person must not linger on the next, and a refusal that arrives
	// after stepping on belongs to the person it was made for.
	const { error: emailError, trackResult } = createActionError(
		() => person()._id
	);
	async function commitEmail(next: string): Promise<void> {
		await trackResult(
			call(
				update.mutateAsync({ id: person()._id, email: next }),
				"Could not change the email."
			)
		);
	}
	async function cancelPending(): Promise<void> {
		await trackResult(
			call(
				cancelEmailChange.mutateAsync({ personId: person()._id }),
				"Could not cancel the email change."
			)
		);
	}
	return (
		<>
			<PropertyRow icon={ICONS.email} label="Email">
				<EditableText
					value={person().email}
					onCommit={(value) => {
						void commitEmail(value);
					}}
				/>
			</PropertyRow>
			<InlineError message={emailError()} />
			<Show when={pendingEmail.data()?.newEmail} keyed>
				{(address) => (
					<div class={styles.pendingEmail} role="status">
						<p class={styles.fieldNote}>
							Waiting for {address} to confirm
						</p>
						<Button
							variant="tertiary"
							onClick={() => {
								void cancelPending();
							}}
						>
							Cancel
						</Button>
					</div>
				)}
			</Show>
		</>
	);
}

/** A guest's host, re-picked here; a refusal shows in the field list's
 *  `saveError`. */
const HOST_SCOPE = "host";

function HostedByRow(props: {
	person: Doc<"people">;
	saveError: ActionErrorState;
}) {
	const setHost = useMutation(api.people.setHost);
	return (
		<PropertyRow icon={ICONS.host} label="Hosted by">
			<HostSelect
				value={props.person.hostedById ?? null}
				placeholder={
					props.person.hostedBy
						? `${props.person.hostedBy} — re-pick`
						: undefined
				}
				onCommit={(id) => {
					void props.saveError.trackResult(
						call(
							setHost.mutateAsync({
								id: props.person._id,
								hostedById: id,
							}),
							"Could not change the host."
						),
						HOST_SCOPE
					);
				}}
			/>
		</PropertyRow>
	);
}

/** Editable field list; saves each field via `people.update` on blur/change.
 * Mounted only in edit mode (so the read-only view needs no Convex mutation). */
export function EditableDetail(props: { person: Doc<"people"> }) {
	const update = useMutation(api.people.update);
	function person() {
		return props.person;
	}
	const saveError = createActionError(() => person()._id);
	function patch(fields: Record<string, unknown>): void {
		void saveError.trackResult(
			call(
				update.mutateAsync({ id: person()._id, ...fields }),
				"Could not save the change."
			),
			scopeOfFields(fields)
		);
	}
	return (
		<div>
			<EmailEditor person={person()} />
			<PropertyRow icon={ICONS.name} label="First name">
				<EditableText
					value={person().firstName}
					onCommit={(value) => {
						patch({ firstName: value });
					}}
				/>
			</PropertyRow>
			<PropertyRow icon={ICONS.name} label="Last name">
				<EditableText
					value={person().lastName}
					onCommit={(value) => {
						patch({ lastName: value });
					}}
				/>
			</PropertyRow>
			<PhoneField
				value={person().phone}
				onCommit={(value) => {
					patch({ phone: value });
				}}
			/>
			<CompanyField
				label="Venture"
				value={person().venture?.name}
				onCommit={(value) => {
					patch({ ventureName: value });
				}}
			/>
			<VerticalField
				value={person().vertical}
				onCommit={(value) => {
					patch({ vertical: value });
				}}
			/>
			{/* Hosting stays here — guest-only, board-managed, not a shared field. */}
			<Show when={person().tier === "guest"}>
				<HostedByRow person={person()} saveError={saveError} />
			</Show>
			<VentureEditor person={person()} patch={patch} />
			<InlineError message={saveError.error()} />
		</div>
	);
}

/**
 * The applicant's own answers, editable. Kept beside the read-only version in
 * `VentureDetail` (PersonReadOnly.tsx): the two must offer the same fields, or editing a
 * person silently hides half their profile — which is exactly what happened
 * when the Applications drawer was a separate component from this one.
 */
function VentureEditor(props: {
	person: Doc<"people">;
	patch: (fields: Record<string, unknown>) => void;
}) {
	function venture() {
		return props.person.venture;
	}
	return (
		<>
			<DescriptionRow
				value={venture()?.description}
				onCommit={(value) => {
					props.patch({ description: value });
				}}
			/>
			<PastBuiltField
				value={venture()?.pastBuilt}
				onCommit={(value) => {
					props.patch({ pastBuilt: value });
				}}
			/>
			<WhyJoinField
				value={venture()?.whyJoin}
				onCommit={(value) => {
					props.patch({ whyJoin: value });
				}}
			/>
			<ProductStageField
				value={venture()?.productStage}
				onCommit={(value) => {
					props.patch({ productStage: value });
				}}
			/>
			<FundingStageField
				value={venture()?.fundingStage}
				onCommit={(value) => {
					props.patch({ fundingStage: value });
				}}
			/>
			<ReferralField
				value={venture()?.referral}
				onCommit={(value) => {
					props.patch({ referral: value });
				}}
			/>
		</>
	);
}
