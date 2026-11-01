// apps/web/emails/templates/perkRequested.tsx
import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	name: string;
	/** "Ada Lovelace (ada@example.com, Acme)", composed by the kind. */
	requester: string;
	perkTitle: string;
	partner: string;
	/** Why this person hears about it: they are the perk's contact, or the
	 *  board is covering for a perk that has none. */
	reason: string;
	/**
	 * Placeholder for the member's note; build.ts fills it from the `note`
	 * list field (one escaped quote, in a paragraph box of its own). Empty
	 * when they left none: no box, no blank line.
	 */
	note: string;
	viewUrl: string;
	manageUrl: string;
	logoUrl: string;
};

/** Someone asked for a perk; whoever gets this follows up with the partner. */
export function Template({
	name,
	requester,
	perkTitle,
	partner,
	reason,
	note,
	viewUrl,
	manageUrl,
	logoUrl,
}: Props) {
	return (
		<EmailLayout
			preview="New perk request"
			logoUrl={logoUrl}
			manageUrl={manageUrl}
		>
			<Heading style={styles.heading}>Perk requested</Heading>
			<Text style={styles.text}>
				Hi {name}, {requester} requested {perkTitle} from {partner}.{" "}
				{reason}
			</Text>
			{note}
			<Link href={viewUrl} style={styles.button}>
				View the request
			</Link>
		</EmailLayout>
	);
}
