// apps/web/emails/templates/perkRequestOutcome.tsx
import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	name: string;
	/** "Perk request granted" or "Perk request declined", set by the kind. */
	headline: string;
	perkTitle: string;
	partner: string;
	/** "granted" or "declined". */
	outcome: string;
	viewUrl: string;
	manageUrl: string;
	logoUrl: string;
};

/** The board answered the recipient's own perk request. */
export function Template({
	name,
	headline,
	perkTitle,
	partner,
	outcome,
	viewUrl,
	manageUrl,
	logoUrl,
}: Props) {
	return (
		<EmailLayout preview={headline} logoUrl={logoUrl} manageUrl={manageUrl}>
			<Heading style={styles.heading}>{headline}</Heading>
			<Text style={styles.text}>
				Hi {name}, your request for {perkTitle} from {partner} was{" "}
				{outcome}.
			</Text>
			<Link href={viewUrl} style={styles.button}>
				View the perk
			</Link>
		</EmailLayout>
	);
}
