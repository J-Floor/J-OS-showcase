import { Button, EditableText, PropertyRow } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { createEffect, createSignal, on, Show } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { useQuery } from "../../../shared/data/useQuery.ts";
import { ICONS } from "../../../shared/icons.ts";
import { userErrorMessage } from "../../../shared/userErrorMessage.ts";
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
	const [emailError, setEmailError] = createSignal<string | null>(null);
	// The drawer is re-used as the board steps through rows, so a clash error
	// for one person must not linger on the next.
	createEffect(
		on(
			() => person()._id,
			() => {
				setEmailError(null);
			},
			{ defer: true }
		)
	);
	async function commitEmail(next: string): Promise<void> {
		setEmailError(null);
		const id = person()._id;
		try {
			await update.mutateAsync({ id, email: next });
		} catch (err) {
			// The board may have stepped to another person while this was in
			// flight; the refusal belongs to the person it was made for.
			if (person()._id === id)
				setEmailError(
					userErrorMessage(err, "Could not change the email.")
				);
		}
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
			<Show when={emailError()}>
				{(message) => (
					<p class={styles.fieldError} role="alert">
						{message()}
					</p>
				)}
			</Show>
			<Show when={pendingEmail.data()?.newEmail} keyed>
				{(address) => (
					<div class={styles.pendingEmail} role="status">
						<p class={styles.fieldNote}>
							Waiting for {address} to confirm
						</p>
						<Button
							variant="tertiary"
							onClick={() =>
								void cancelEmailChange.mutateAsync({
									personId: person()._id,
								})
							}
						>
							Cancel
						</Button>
					</div>
				)}
			</Show>
		</>
	);
}

/** Editable field list; saves each field via `people.update` on blur/change.
 * Mounted only in edit mode (so the read-only view needs no Convex mutation). */
export function EditableDetail(props: { person: Doc<"people"> }) {
	const update = useMutation(api.people.update);
	const setHost = useMutation(api.people.setHost);
	function person() {
		return props.person;
	}
	function patch(fields: Record<string, unknown>): void {
		void update.mutateAsync({ id: person()._id, ...fields });
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
				<PropertyRow icon={ICONS.host} label="Hosted by">
					<HostSelect
						value={person().hostedById ?? null}
						placeholder={
							person().hostedBy
								? `${person().hostedBy} — re-pick`
								: undefined
						}
						onCommit={(id) => {
							void setHost.mutateAsync({
								id: person()._id,
								hostedById: id,
							});
						}}
					/>
				</PropertyRow>
			</Show>
			<VentureEditor person={person()} patch={patch} />
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
