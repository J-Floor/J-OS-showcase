import { Table, type JfColumnDef } from "@j-os/design-system";
import { useQuery } from "convex-solidjs";

import { api } from "../../../convex/_generated/api";

type Contact = { firstName: string; lastName: string; phone?: string };

const columns: JfColumnDef<Contact>[] = [
	{ accessorKey: "firstName", header: "First name", dataType: "string" },
	{ accessorKey: "lastName", header: "Last name", dataType: "string" },
	{
		id: "phone",
		header: "Phone",
		dataType: "string",
		accessorFn: (r) => (r.phone?.trim() ? r.phone : "—"),
	},
];

/** Member-facing read-only directory of board members and their phone numbers.
 * This is the ONLY community content a non-board member sees — members do not
 * see other members. */
export function BoardContacts() {
	const contacts = useQuery(
		api.people.listBoardContacts,
		{},
		{ keepPreviousData: true }
	);
	return <Table.Root columns={columns} data={contacts.data()} />;
}
