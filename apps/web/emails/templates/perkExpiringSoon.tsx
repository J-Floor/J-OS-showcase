// apps/web/emails/templates/perkExpiringSoon.tsx
import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	name: string;
	perkTitle: string;
	partner: string;
	/** The perk's last valid day, written out ("9 November 2026"). */
	endDate: string;
	viewUrl: string;
	manageUrl: string;
	logoUrl: string;
};

/** A perk's last valid day is a week away. */
export function Template({
	name,
	perkTitle,
	partner,
	endDate,
	viewUrl,
	manageUrl,
	logoUrl,
}: Props) {
	return (
		<EmailLayout
			preview="Perk ending soon"
			logoUrl={logoUrl}
			manageUrl={manageUrl}
		>
			<Heading style={styles.heading}>Perk ending soon</Heading>
			<Text style={styles.text}>
				Hi {name}, {perkTitle} from {partner} ends on {endDate}.
			</Text>
			<Link href={viewUrl} style={styles.button}>
				View the perk
			</Link>
		</EmailLayout>
	);
}
