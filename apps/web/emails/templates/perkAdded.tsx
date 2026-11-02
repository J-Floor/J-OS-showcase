// apps/web/emails/templates/perkAdded.tsx
import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	name: string;
	perkTitle: string;
	partner: string;
	viewUrl: string;
	manageUrl: string;
	logoUrl: string;
};

/** The board added a perk; everyone who can view Perks hears about it. */
export function Template({
	name,
	perkTitle,
	partner,
	viewUrl,
	manageUrl,
	logoUrl,
}: Props) {
	return (
		<EmailLayout preview="New perk" logoUrl={logoUrl} manageUrl={manageUrl}>
			<Heading style={styles.heading}>New perk</Heading>
			<Text style={styles.text}>
				Hi {name}, there's a new perk on J floor: {perkTitle} from{" "}
				{partner}.
			</Text>
			<Link href={viewUrl} style={styles.button}>
				View the perk
			</Link>
		</EmailLayout>
	);
}
