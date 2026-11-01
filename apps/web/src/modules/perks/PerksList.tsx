import { EmptyState, Table } from "@j-os/design-system";

import type { PerkRow } from "../../../convex/perks.ts";
import { createEntitySelection } from "../../shared/entity/createEntitySelection.ts";
import { useRowPrefetch } from "../../shared/entity/useRowPrefetch.ts";
import { ICONS } from "../../shared/icons.ts";

import { perksEntity } from "./entity.ts";
import { PERKS_DEFAULT_SORT, perkColumns } from "./perkColumns.tsx";
import { PerkSheet } from "./PerkSheet.tsx";

type PerksListProps = {
	/** Whether the Perks tab is the one on screen, on the board's tabbed
	 *  page. Omitted (everyone else's page), the list is always active. Gates
	 *  the `?perk=` read/write side of the selection. */
	active?: () => boolean;
	/** A `?perk=` link arrived while the Requests tab was showing: switch to
	 *  the Perks tab so the selection can open it. */
	onNeedTab?: (slug: string) => void;
	/** Hands the board's page the opener of the create sheet, once, for the
	 *  New perk button in its tab bar. Omitted, the list offers no create. */
	openCreateRef?: (openCreate: () => void) => void;
};

/**
 * The perks table, grouped Active / Expired. Everyone but the board gets the
 * Active group, and an expired perk only while their own request on it is
 * open (`visiblePerks`). A row opens the perk's sheet (`?perk=<id>`), the
 * sheet a palette pick or a request email opens too. The board's page also
 * opens the same sheet empty, in create mode, from its New perk button
 * (`openCreateRef`). No shell and no page title of its own: `PerksPage` puts
 * it straight in its panel, so the table keeps a sticky header as Inventory's
 * items do, and the sidebar names the page.
 */
export function PerksList(props: PerksListProps) {
	// The descriptor's rows, so the page, the palette and a peek list the
	// same perks. `undefined` while the perks or the viewer's open requests
	// load, so the table shows its skeleton rather than the empty state.
	const rows = perksEntity.useRows();
	const prefetchRow = useRowPrefetch(perksEntity);

	const {
		selected,
		loading,
		open,
		openRow,
		openCreate,
		close,
		prebuild,
		intend,
	} = createEntitySelection<PerkRow>({
		rows,
		param: "perk",
		active: () => props.active?.() ?? true,
		onNeedTab: (slug) => {
			props.onNeedTab?.(slug);
		},
	});
	// eslint-disable-next-line solid/reactivity -- handed over once, like a ref
	props.openCreateRef?.(openCreate);

	return (
		<>
			<Table.Root
				columns={perkColumns()}
				data={rows()}
				getRowId={(row) => row._id}
				initialColumnSorting={PERKS_DEFAULT_SORT}
				groupBy="availability"
				focusableRows
				suppressFocus={open()}
				onRowClick={openRow}
				onRowActivate={openRow}
				onRowHoverIntent={(row) => {
					prefetchRow(row);
					intend();
				}}
				onFocusedRowChange={prefetchRow}
			>
				<Table.Empty>
					<EmptyState
						icon={ICONS.perks}
						title="No perks yet"
						description="Deals J floor negotiates with partners show up here."
					/>
				</Table.Empty>
			</Table.Root>
			<PerkSheet
				open={open()}
				prebuild={prebuild()}
				onOpenChange={(isOpen) => {
					if (!isOpen) close();
				}}
				perk={selected()}
				loading={loading()}
			/>
		</>
	);
}
