import type { JfColumnDef } from "@j-os/design-system";
import { Show } from "solid-js";

import type { Doc } from "../../../../convex/_generated/dataModel";
import {
	fundingStageOptions,
	productStageOptions,
	verticalOptions,
} from "../../signup/options.ts";
import { verticalsLabel } from "../drawers/labels.ts";
import { VentureLink } from "../VentureLink.tsx";

import styles from "./ventureColumns.module.scss";

/** Anything the three rosters render. All three read one table and one query
 *  shape, so the venture columns below are the same columns everywhere. */
type PersonLike = Doc<"people">;

/**
 * What a person told us they are building — shared by Applications, Members and
 * Guests.
 *
 * These lived only on the Applications tab, so the moment somebody was approved
 * the board could no longer scan for "who here is doing hardware" or read back
 * why anyone joined; they had to open a drawer per row. The drawer already
 * shows this for the whole lifecycle (see `VentureDetail`) — the tables did not,
 * and the gap was purely that the column definitions sat in one tab's file.
 *
 * One definition rather than three copies, because the thing being asked for is
 * that they LOOK the same: the same three-line clamp, the same one-link-plus-
 * count treatment, the same widths. Three copies drift on the first tweak, and
 * a row is as tall as its tallest cell — so a clamp missing on one tab is not a
 * cosmetic difference, it is a tab whose rows are four times as tall.
 */
export function ventureColumns<Row extends PersonLike>(): JfColumnDef<Row>[] {
	return [
		{
			id: "vertical",
			header: "Vertical",
			dataType: "enum",
			enumOptions: verticalOptions,
			// The raw values, so the filter matches a person carrying several.
			accessorFn: (r) => r.vertical ?? [],
			cell: (info) => verticalsLabel(info.row.original.vertical),
		},
		{
			id: "description",
			header: "Description",
			dataType: "string",
			size: 260,
			accessorFn: (r) => r.venture?.description ?? "",
			cell: (info) => clampCell(info.row.original.venture?.description),
		},
		{
			id: "pastBuilt",
			header: "Past built",
			dataType: "string",
			size: 260,
			accessorFn: (r) => r.venture?.pastBuilt ?? "",
			cell: (info) => clampCell(info.row.original.venture?.pastBuilt),
		},
		{
			id: "whyJoin",
			header: "Why join",
			dataType: "string",
			size: 260,
			accessorFn: (r) => r.venture?.whyJoin ?? "",
			cell: (info) => clampCell(info.row.original.venture?.whyJoin),
		},
		{
			id: "productStage",
			header: "Product stage",
			dataType: "enum",
			enumOptions: productStageOptions,
			accessorFn: (r) => r.venture?.productStage,
		},
		{
			id: "fundingStage",
			header: "Funding stage",
			dataType: "enum",
			enumOptions: fundingStageOptions,
			accessorFn: (r) => r.venture?.fundingStage,
		},
		{
			id: "teamSize",
			header: "Team size",
			dataType: "number",
			// Not `?? 0`: a founder who left the field blank would otherwise be
			// indistinguishable from one who told us they work alone.
			accessorFn: (r) => r.venture?.teamSize,
			cell: (info) => info.getValue<number | undefined>() ?? "—",
		},
		{
			id: "referral",
			header: "Referral",
			dataType: "string",
			accessorFn: (r) => r.venture?.referral ?? "",
		},
		{
			id: "links",
			header: "Links",
			dataType: "string",
			disableRowClick: true,
			accessorFn: (r) => (r.venture?.links ?? []).length,
			cell: (info) => <LinksCell venture={info.row.original.venture} />,
		},
	];
}

/** Long free text, clamped to a few lines; the drawer has all of it. */
function clampCell(text: string | undefined) {
	return <span class={styles.clamp}>{text ?? ""}</span>;
}

/**
 * ONE link, on one line, ellipsed, with a count of the rest.
 *
 * This used to render every link stacked and free to wrap: someone with five
 * links and a long URL made a row several times the height of its neighbours —
 * and a table row is as tall as its tallest cell, so that one person stretched
 * every other column on the row with them. The drawer lists all of them, so the
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
