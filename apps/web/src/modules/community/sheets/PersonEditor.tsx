import { EditableText, PropertyRow, useSaveTracker } from "@j-os/design-system";
import type { FunctionArgs } from "convex/server";
import { useMutation } from "convex-solidjs";
import { type Accessor, Show } from "solid-js";

import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { call } from "../../../lib/call.ts";
import {
	createActionError,
	type ActionErrorState,
} from "../../../shared/createActionError.ts";
import { createEntityPatch } from "../../../shared/entity/createEntityPatch.ts";
import { ICONS } from "../../../shared/icons.ts";
import { InlineError } from "../../../shared/InlineError.tsx";
import { reportSave } from "../../../shared/reportSave.ts";
import { HostSelect } from "../columns/HostSelect.tsx";
import { personFields } from "../fields.ts";
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

/** The fields one edit changes: `people.update`'s arguments bar the id. */
export type PersonPatch = Omit<FunctionArgs<typeof api.people.update>, "id">;

/** The email row. An email edit saves at once; a refused change shows its
 * reason beside the field. */
function EmailEditor(props: {
	person: Doc<"people">;
	isOpen: Accessor<boolean>;
}) {
	function person() {
		return props.person;
	}
	const tracker = useSaveTracker();
	const update = useMutation(api.people.update);
	// The sheet is re-used as the board steps through rows, so a clash error
	// for one person must not linger on the next, and a refusal that arrives
	// after stepping on belongs to the person it was made for.
	const { error: emailError, trackResult } = createActionError(
		() => person()._id
	);
	function commitEmail(next: string): void {
		const id = person()._id;
		reportSave(
			tracker?.track(EMAIL_SCOPE),
			() =>
				trackResult(
					call(
						update.mutateAsync({ id, email: next }),
						"Could not change the email."
					)
				),
			props.isOpen
		);
	}
	return (
		<>
			<PropertyRow field={personFields.email}>
				<EditableText
					label={personFields.email.label}
					value={person().email}
					onCommit={(value) => {
						commitEmail(value);
					}}
				/>
			</PropertyRow>
			<InlineError message={emailError()} />
		</>
	);
}

/** A guest's host, re-picked here; a refusal shows in the field list's
 *  `saveError`. */
const HOST_SCOPE = "host";

/** The email's own save, beside the field list's. */
const EMAIL_SCOPE = "email";

function HostedByRow(props: {
	person: Doc<"people">;
	saveError: ActionErrorState;
	isOpen: Accessor<boolean>;
}) {
	const setHost = useMutation(api.people.setHost);
	const tracker = useSaveTracker();
	return (
		<PropertyRow field={personFields.hostedById}>
			<HostSelect
				value={props.person.hostedById ?? null}
				legacyHost={props.person.hostedBy}
				onCommit={(hostedById) => {
					const id = props.person._id;
					const saveError = props.saveError;
					reportSave(
						tracker?.track(HOST_SCOPE),
						() =>
							saveError.trackResult(
								call(
									setHost.mutateAsync({ id, hostedById }),
									"Could not change the host."
								),
								HOST_SCOPE
							),
						props.isOpen
					);
				}}
			/>
		</PropertyRow>
	);
}

/** Editable field list; saves each field via `people.update` on blur/change,
 * reporting to the sheet's save status. Mounted only in edit mode (so the
 * read-only view needs no Convex mutation). `isOpen`: the sheet is open, so
 * a save failing once it closed toasts. */
export function EditableDetail(props: {
	person: Doc<"people">;
	isOpen: Accessor<boolean>;
}) {
	const update = useMutation(api.people.update);
	function person() {
		return props.person;
	}
	// One error area for the sheet: the host row reports into it too.
	const saveError = createEntityPatch<PersonPatch, Id<"people">>({
		key: () => person()._id,
		write: (id, fields) => update.mutateAsync({ id, ...fields }),
		isOpen: () => props.isOpen(),
	});
	const { patch } = saveError;
	return (
		<div>
			<EmailEditor person={person()} isOpen={props.isOpen} />
			<PropertyRow icon={ICONS.name} label="First name">
				<EditableText
					label={personFields.firstName.label}
					value={person().firstName}
					onCommit={(value) => {
						patch({ firstName: value });
					}}
				/>
			</PropertyRow>
			<PropertyRow icon={ICONS.name} label="Last name">
				<EditableText
					label={personFields.lastName.label}
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
				value={person().venture?.name}
				onCommit={(value) => {
					patch({ ventureName: value });
				}}
			/>
			{/* Hosting stays here — guest-only, board-managed, not a shared field. */}
			<Show when={person().tier === "guest"}>
				<HostedByRow
					person={person()}
					saveError={saveError}
					isOpen={props.isOpen}
				/>
			</Show>
			<VerticalField
				value={person().vertical}
				onCommit={(value) => {
					patch({ vertical: value });
				}}
			/>
			<VentureEditor person={person()} patch={patch} />
			<InlineError message={saveError.error()} />
		</div>
	);
}

/**
 * The applicant's own answers, editable. Kept beside the read-only version in
 * `VentureDetail` (PersonReadOnly.tsx): the two must offer the same fields, or editing a
 * person silently hides half their profile — which is exactly what happened
 * when the Applications sheet was a separate component from this one.
 */
function VentureEditor(props: {
	person: Doc<"people">;
	patch: (fields: PersonPatch) => void;
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
