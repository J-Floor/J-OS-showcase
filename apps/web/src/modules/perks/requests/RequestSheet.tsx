import { Accordion, PropertyRow, Sheet, morphPart } from "@j-os/design-system";
import { Show, createSignal, type JSX } from "solid-js";

import type { PerkRequestRow } from "../../../../convex/perkRequests.ts";
import { ActionBar } from "../../../shared/actions/ActionBar.tsx";
import { ActionKeys } from "../../../shared/actions/createActionKeys.ts";
import type { SheetNavState } from "../../../shared/entity/createSheetNav.ts";
import { EntitySheetNav } from "../../../shared/entity/EntitySheetNav.tsx";
import { SheetFooter } from "../../../shared/entity/SheetFooter.tsx";
import { SheetSection } from "../../../shared/entity/SheetSection.tsx";
import type { SheetOpenProps } from "../../../shared/types.ts";

import { createRequestActions } from "./requestActions.ts";
import {
	RequestDetailsSection,
	RequestHistorySection,
	requestFields,
} from "./RequestDetails.tsx";
import styles from "./RequestSheet.module.scss";

const ALL_SECTIONS = ["details", "history"];

/** Where a request sheet's footer keys are live. */
const REQUEST_SHEET_SCOPE = "request-sheet";

/** What the sheet is open for: a request, or one still loading. */
type RequestSheetProps = SheetOpenProps & {
	request?: PerkRequestRow;
	/** Open for a request whose row hasn't loaded yet. Wins over
	 *  `request`. */
	loading?: boolean;
	/** The Requests tab's prev/next; a peek has none. */
	nav?: SheetNavState;
};

/** `Sheet.Skeleton`'s placeholder while the request loads: shaped like the
 *  Details section, with literal placeholder text. */
function RequestFieldsPlaceholder(): JSX.Element {
	return (
		<Accordion.Root multiple defaultValue={ALL_SECTIONS}>
			<SheetSection value="details" title="Details">
				<PropertyRow field={requestFields.requester}>
					<span>placeholder</span>
				</PropertyRow>
				<PropertyRow
					label={requestFields.perk.label}
					icon={requestFields.perk.icon}
				>
					<span>placeholder</span>
				</PropertyRow>
			</SheetSection>
		</Accordion.Root>
	);
}

/** Who asked as the title, the perk under it, and the way out: prev/next on
 *  the Requests tab, the link to it on a peek, and close. */
function RequestSheetHeader(
	props: Pick<RequestSheetProps, "request" | "loading" | "nav">
): JSX.Element {
	return (
		<Sheet.Header>
			<div class={styles.heading}>
				<Sheet.Title loading={props.loading}>
					{props.request?.requesterName ?? ""}
				</Sheet.Title>
				{/* Always there, as the title is: a marked element swapped in
				    mid-transition would skip the morph. Keyed as the perk,
				    so the row's Perk cell flies into it and back; not while
				    loading, as the title: nothing flies into an empty line. */}
				<p
					class={styles.subtitle}
					{...morphPart(
						props.loading ? undefined : requestFields.perk
					)}
				>
					{props.loading ? "" : (props.request?.perkTitle ?? "")}
				</p>
			</div>
			<Sheet.HeaderActions>
				<EntitySheetNav nav={props.nav} />
				<Sheet.Close />
			</Sheet.HeaderActions>
		</Sheet.Header>
	);
}

/**
 * A perk request's sheet, the board's: who asked for which perk, from which
 * venture, who the perk's contact is, when they asked and what they wrote,
 * then the request's history. The requester and the perk each open their
 * own peek. The footer moves the request to Contacted (`C`), Granted (`G`)
 * or Declined (`X`); its current status is offered disabled. The sheet
 * morphs out of the request's row and back into it.
 */
export function RequestSheet(props: RequestSheetProps): JSX.Element {
	// Controlled + onValueChange so the sections collapse, as on the perk
	// sheet; a bare `value` with no setter pins them open.
	const [openSections, setOpenSections] = createSignal(ALL_SECTIONS);
	const requestActions = createRequestActions({
		requestId: () => props.request?._id,
	});
	return (
		<Sheet.Root
			open={props.open}
			prebuild={props.prebuild}
			onOpenChange={props.onOpenChange}
			morphId={props.request?._id}
		>
			<ActionKeys<PerkRequestRow>
				scope={REQUEST_SHEET_SCOPE}
				actions={requestActions.actions}
				target={() =>
					props.open && !props.loading ? props.request : undefined
				}
				active={() => props.open}
			/>
			<RequestSheetHeader
				request={props.request}
				loading={props.loading}
				nav={props.nav}
			/>

			<Sheet.Skeleton>
				<RequestFieldsPlaceholder />
			</Sheet.Skeleton>
			<Sheet.Body loading={props.loading}>
				<Show when={props.request}>
					{(request) => (
						<Accordion.Root
							multiple
							value={openSections()}
							onValueChange={(details) => {
								setOpenSections(details.value);
							}}
						>
							<RequestDetailsSection request={request} />
							<RequestHistorySection request={request} />
						</Accordion.Root>
					)}
				</Show>
			</Sheet.Body>

			{/* Not keyed: a refetched row must not remount the bar and lose a
			    refusal. */}
			<Show when={!props.loading && props.request}>
				{(request) => (
					<SheetFooter error={requestActions.error()}>
						<ActionBar
							actions={requestActions.actions()}
							target={request()}
						/>
					</SheetFooter>
				)}
			</Show>
		</Sheet.Root>
	);
}
