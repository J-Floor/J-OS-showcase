import { Table, type JfColumnDefinition } from "@j-os/design-system";

import { api } from "../../../convex/_generated/api";
import { useQuery } from "../../shared/data/useQuery.ts";

type Contact = { firstName: string; lastName: string; phone?: string };

const columns: JfColumnDefinition<Contact>[] = [
	{ accessorKey: "firstName", header: "First name", dataType: "string" },
	{ accessorKey: "lastName", header: "Last name", dataType: "string" },
	{
		id: "phone",
		header: "Phone",
		dataType: "string",
		accessorFn: (row) => (row.phone?.trim() ? row.phone : "—"),
	},
];

/** Member-facing read-only directory of board members and their phone numbers.
 * This is the ONLY community content a non-board member sees — members do not
 * see other members. */
export function BoardContacts() {
	const contacts = useQuery(api.people.listBoardContacts, {});
	return (
		<Table.Root
			columns={columns}
			data={contacts.data()}
			// The directory carries no ids (only names and phones reach a
			// member), and its rows are never selected or opened.
			getRowId={(_, index) => String(index)}
		/>
	);
}
