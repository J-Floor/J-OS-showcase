import {
	Combobox,
	Input,
	NumberInput,
	Select,
	TextArea,
	type SelectItem,
} from "@j-os/design-system";
import { For, Show } from "solid-js";

import { SelectOptionList } from "../../shared/components/SelectOptionList.tsx";
import { ICONS } from "../../shared/icons.ts";

import {
	fundingStageOptions,
	productStageOptions,
	verticalOptions,
	type FundingStage,
	type ProductStage,
	type Vertical,
} from "./options.ts";
import styles from "./SignUp.module.scss";
import { EXTRA_LINK_INDEXES, type SignUpForm } from "./signUpForm.ts";

type FieldsProps = { form: SignUpForm };

const PRODUCT_STAGE_ITEMS: SelectItem[] = productStageOptions.map((option) => ({
	value: option.value,
	title: option.label,
}));

const FUNDING_STAGE_ITEMS: SelectItem[] = fundingStageOptions.map((option) => ({
	value: option.value,
	title: option.label,
}));

/** Who is applying: name, email and phone. */
export function IdentityFields(props: FieldsProps) {
	return (
		<>
			<div class={styles.row}>
				<Input
					label="First name"
					required
					disabled={props.form.submitting()}
					disabledReason="Submitting…"
					value={props.form.fields.firstName()}
					onValueChange={(event) =>
						props.form.fields.setFirstName(
							event.currentTarget.value
						)
					}
					{...props.form.errProps(props.form.errors().firstName)}
				/>
				<Input
					label="Last name"
					required
					disabled={props.form.submitting()}
					disabledReason="Submitting…"
					value={props.form.fields.lastName()}
					onValueChange={(event) =>
						props.form.fields.setLastName(event.currentTarget.value)
					}
					{...props.form.errProps(props.form.errors().lastName)}
				/>
			</div>

			<Input
				type="email"
				label="Email"
				helperText="Use your company email if you have one."
				placeholder="you@example.com"
				leadingIconName={ICONS.email}
				autocomplete="email"
				required
				disabled={props.form.submitting()}
				disabledReason="Submitting…"
				value={props.form.fields.email()}
				onValueChange={(event) =>
					props.form.fields.setEmail(event.currentTarget.value)
				}
				{...props.form.errProps(props.form.errors().email)}
			/>

			<Input
				type="tel"
				label="Phone (WhatsApp)"
				helperText="Include your country code."
				placeholder="+41 79 000 00 00"
				leadingIconName={ICONS.phone}
				required
				disabled={props.form.submitting()}
				disabledReason="Submitting…"
				value={props.form.fields.phone()}
				onValueChange={(event) =>
					props.form.fields.setPhone(event.currentTarget.value)
				}
				{...props.form.errProps(props.form.errors().phone)}
			/>
		</>
	);
}

/** The venture: name, pitch, past work. */
export function VentureFields(props: FieldsProps) {
	return (
		<>
			<Input
				label="Venture / project name"
				required
				disabled={props.form.submitting()}
				disabledReason="Submitting…"
				value={props.form.fields.ventureName()}
				onValueChange={(event) =>
					props.form.fields.setVentureName(event.currentTarget.value)
				}
				{...props.form.errProps(props.form.errors().ventureName)}
			/>

			<TextArea
				label="What is your venture/project about?"
				helperText="A few sentences, elevator pitch style."
				required
				disabled={props.form.submitting()}
				disabledReason="Submitting…"
				value={props.form.fields.description()}
				onInput={props.form.fields.setDescription}
				{...props.form.errProps(props.form.errors().description)}
			/>

			<TextArea
				label="What have you built before?"
				helperText="A short summary is fine."
				required
				disabled={props.form.submitting()}
				disabledReason="Submitting…"
				value={props.form.fields.pastBuilt()}
				onInput={props.form.fields.setPastBuilt}
				{...props.form.errProps(props.form.errors().pastBuilt)}
			/>
		</>
	);
}

/** How far along the venture is: product stage and funding stage. */
export function StageFields(props: FieldsProps) {
	return (
		<>
			<Select.Root
				label="Product stage"
				helperText="How far along is the product?"
				placeholder="Pick one"
				allowClearing
				required
				disabled={props.form.submitting()}
				disabledReason="Submitting…"
				options={PRODUCT_STAGE_ITEMS}
				value={
					props.form.fields.productStage() === ""
						? []
						: [props.form.fields.productStage()]
				}
				onValueChange={(details) =>
					props.form.fields.setProductStage(
						(details.value[0] as ProductStage | undefined) ?? ""
					)
				}
				{...props.form.errProps(props.form.errors().productStage)}
			>
				<SelectOptionList options={PRODUCT_STAGE_ITEMS} />
			</Select.Root>

			<Select.Root
				label="Funding stage"
				helperText="Have you raised, and at what stage?"
				placeholder="Pick one"
				allowClearing
				required
				disabled={props.form.submitting()}
				disabledReason="Submitting…"
				options={FUNDING_STAGE_ITEMS}
				value={
					props.form.fields.fundingStage() === ""
						? []
						: [props.form.fields.fundingStage()]
				}
				onValueChange={(details) =>
					props.form.fields.setFundingStage(
						(details.value[0] as FundingStage | undefined) ?? ""
					)
				}
				{...props.form.errProps(props.form.errors().fundingStage)}
			>
				<SelectOptionList options={FUNDING_STAGE_ITEMS} />
			</Select.Root>
		</>
	);
}

/** Which industries the venture is in. */
export function IndustryField(props: FieldsProps) {
	return (
		<Combobox.Root
			label="Industry / vertical"
			helperText="Pick all that apply."
			placeholder="Pick one or more"
			multiple
			allowClearing
			required
			disabled={props.form.submitting()}
			disabledReason="Submitting…"
			items={verticalOptions.map((option) => ({
				value: option.value,
				label: option.label,
			}))}
			value={props.form.fields.verticals()}
			onValueChange={(details) =>
				props.form.fields.setVerticals(details.value as Vertical[])
			}
			{...props.form.errProps(props.form.errors().verticals)}
		/>
	);
}

/** How many people will use the space. */
export function TeamFields(props: FieldsProps) {
	return (
		<NumberInput
			label="Team size"
			helperText="Only count the people that will use the space. Each member should apply separately."
			min={1}
			required
			disabled={props.form.submitting()}
			disabledReason="Submitting…"
			value={props.form.fields.teamSize()}
			onValueChange={(details) =>
				props.form.fields.setTeamSize(details.value)
			}
			{...props.form.errProps(props.form.errors().teamSize)}
		/>
	);
}

/** The profile link, and optional extra links that reveal one at a time:
 *  each shows only once the previous one has a value. */
export function LinkFields(props: FieldsProps) {
	return (
		<>
			<Input
				type="url"
				label="Link to your profile (LinkedIn, X, GitHub, or site)"
				helperText="LinkedIn preferred."
				placeholder="https://…"
				leadingIconName={ICONS.link}
				required
				disabled={props.form.submitting()}
				disabledReason="Submitting…"
				value={props.form.fields.links()[0]}
				onValueChange={(event) => {
					props.form.fields.setLink(0, event.currentTarget.value);
				}}
				{...props.form.errProps(props.form.errors().urls[0])}
			/>
			{/* Optional extra links reveal one at a time: each shows only
			    once the previous one has a value. */}
			<For each={EXTRA_LINK_INDEXES}>
				{(index) => (
					<Show
						when={
							props.form.fields.links()[index - 1].trim() !== ""
						}
					>
						<Input
							type="url"
							label="Link to something else we should look at (optional)"
							placeholder="https://…"
							leadingIconName={ICONS.link}
							disabled={props.form.submitting()}
							disabledReason="Submitting…"
							value={props.form.fields.links()[index]}
							onValueChange={(event) => {
								props.form.fields.setLink(
									index,
									event.currentTarget.value
								);
							}}
							{...props.form.errProps(
								props.form.errors().urls[index]
							)}
						/>
					</Show>
				)}
			</For>
		</>
	);
}

/** Why they want to join, and who referred them. */
export function MotivationFields(props: FieldsProps) {
	return (
		<>
			<TextArea
				label="Why do you want to join J floor?"
				required
				disabled={props.form.submitting()}
				disabledReason="Submitting…"
				value={props.form.fields.whyJoin()}
				onInput={props.form.fields.setWhyJoin}
				{...props.form.errProps(props.form.errors().whyJoin)}
			/>

			<Input
				label="Who referred you?"
				helperText="Optional — the name of the person who referred you."
				placeholder="e.g. Ada Lovelace"
				leadingIconName={ICONS.person}
				disabled={props.form.submitting()}
				disabledReason="Submitting…"
				value={props.form.fields.referral()}
				onValueChange={(event) =>
					props.form.fields.setReferral(event.currentTarget.value)
				}
				{...props.form.errProps(props.form.errors().referral)}
			/>
		</>
	);
}
