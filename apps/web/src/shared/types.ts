import type { OverlayOpenProps, SheetRootProps } from "@j-os/design-system";
import type { useSearchParams } from "@solidjs/router";

import type { Id, TableNames } from "../../convex/_generated/dataModel";

/** The controlled-open pair every overlay in the app takes: the one the
 *  design system's Sheet and Dialog share, so they cannot drift. */
export type OpenProps = OverlayOpenProps;

/** An entity sheet's: the open pair, and `prebuild` (from its selection's
 *  `prebuild()`), so a hinted first open flies the row's values. */
export type SheetOpenProps = OpenProps & Pick<SheetRootProps, "prebuild">;

/** Anything carrying a Convex id of `Table`. */
export type Identified<Table extends TableNames> = { _id: Id<Table> };

/** Anything with a string `_id`. Plain `string` rather than an `Id<Table>`: it
 *  constrains generics that span several tables, and test fixtures use string ids. */
export type EntityRow = { _id: string };

/** The URL-search setter returned by the router's `useSearchParams`. */
export type SetParams = ReturnType<typeof useSearchParams>[1];
