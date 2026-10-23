import { fieldColumn, type JfColumnDefinition } from "@j-os/design-system";
import { Show } from "solid-js";

import type { Doc } from "../../../../convex/_generated/dataModel";
import {
	FREE_TEXT_SIZE,
	SHORT_TEXT_SIZE,
} from "../../../shared/columnSizes.ts";
import {
	fundingStageOptions,
	productStageOptions,
	verticalOptions,
} from "../../signup/options.ts";
import { personFields } from "../fields.ts";
import { VentureLink } from "../VentureLink.tsx";

import styles from "./ventureColumns.module.scss";

const LINKS_COLUMN_WIDTH = 200;

/** Anything the three rosters render. All three read one table and one query
 *  shape, so the venture columns below are the same columns everywhere. */
type PersonLike = Doc<"people">;

/**
 * What a person told us they are building — shared by Applications, Members and
 * Guests.
 *
 * These lived only on the Applications tab, so the moment somebody was approved
 * the board could no longer scan for "who here is doing hardware" or read back
 * why anyone joined; they had to open a sheet per row. The sheet already
 * shows this for the whole lifecycle (see `VentureDetail`) — the tables did not,
 * and the gap was purely that the column definitions sat in one tab's file.
 *
 * One definition rather than three copies, because the thing being asked for is
 * that they LOOK the same: the same three-line clamp, the same one-link-plus-
 * count treatment, the same widths. Three copies drift on the first tweak, and
 * a row is as tall as its tallest cell — so a clamp missing on one tab is not a
 * cosmetic difference, it is a tab whose rows are four times as tall.
 */
export function ventureColumns<
	Row extends PersonLike,
>(): JfColumnDefinition<Row>[] {
	return [
		fieldColumn(personFields.vertical, {
			dataType: "enum",
			enumOptions: verticalOptions,
			size: "content",
			// The raw values, so the filter matches a person carrying several.
			accessorFn: (row) => row.vertical ?? [],
		}),
		freeTextColumn<Row>("description"),
		freeTextColumn<Row>("pastBuilt"),
		freeTextColumn<Row>("whyJoin"),
		fieldColumn(personFields.productStage, {
			dataType: "enum",
			enumOptions: productStageOptions,
			accessorFn: (row) => row.venture?.productStage,
		}),
		fieldColumn(personFields.fundingStage, {
			dataType: "enum",
			enumOptions: fundingStageOptions,
			accessorFn: (row) => row.venture?.fundingStage,
		}),
		fieldColumn(personFields.teamSize, {
			dataType: "number",
			// Not `?? 0`: a founder who left the field blank would otherwise be
			// indistinguishable from one who told us they work alone.
			accessorFn: (row) => row.venture?.teamSize,
			cell: (info) => teamSizeText(info.row.original),
			measureText: teamSizeText,
		}),
		fieldColumn(personFields.links, {
			dataType: "string",
			disableRowClick: true,
			size: LINKS_COLUMN_WIDTH,
			measureText: false,
			accessorFn: (row) => (row.venture?.links ?? []).length,
			cell: (info) => <LinksCell venture={info.row.original.venture} />,
		}),
		fieldColumn(personFields.referral, {
			dataType: "string",
			size: SHORT_TEXT_SIZE,
			measureText: false,
			accessorFn: (row) => row.venture?.referral ?? "",
		}),
	];
}

/** A clamped free-text venture answer, sorted and filtered on its text. */
function freeTextColumn<Row extends PersonLike>(
	id: "description" | "pastBuilt" | "whyJoin"
): JfColumnDefinition<Row> {
	return fieldColumn(personFields[id], {
		dataType: "string",
		size: FREE_TEXT_SIZE,
		measureText: false,
		accessorFn: (row) => row.venture?.[id] ?? "",
		cell: (info) => clampCell(info.row.original.venture?.[id]),
	});
}

function teamSizeText(row: PersonLike): string {
	return String(row.venture?.teamSize ?? "—");
}

/** Long free text, clamped to a few lines; the sheet has all of it. */
function clampCell(text: string | undefined) {
	return <span class={styles.clamp}>{text ?? ""}</span>;
}

/**
 * ONE link, on one line, ellipsed, with a count of the rest.
 *
 * This used to render every link stacked and free to wrap: someone with five
 * links and a long URL made a row several times the height of its neighbours —
 * and a table row is as tall as its tallest cell, so that one person stretched
 * every other column on the row with them. The sheet lists all of them, so the
 * "+N" is what says there is more to go and look at.
 */
function LinksCell(props: { venture: PersonLike["venture"] }) {
	function links() {
		return props.venture?.links ?? [];
	}
	function rest() {
		return links().length - 1;
	}
	return (
		<Show when={links().at(0)} keyed>
			{(link) => (
				<div class={styles.links}>
					<VentureLink link={link} class={styles.link} />
					<Show when={rest() > 0}>
						<span class={styles.more}>+{rest()}</span>
					</Show>
				</div>
			)}
		</Show>
	);
}
