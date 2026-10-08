import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	/** What is wrong, in one sentence — e.g. "J Floor City - Upstairs is offline". */
	headline: string;
	/** The detail a board member needs to act: which locks, how many people. */
	detail: string;
	/** What happens if nobody does anything. */
	consequence: string;
	diagnosticsUrl: string;
	manageUrl: string;
	logoUrl: string;
};

/**
 * Door access is not reaching people, and the board needs to know TODAY.
 *
 * The one email in this set that reports a fault rather than a decision. It
 * exists because the nightly reconciler used to put its failures in a return
 * value that a cron discards — an upstairs lock went unreachable and for over a
 * month the only symptom was guests standing in front of a door they could not
 * open.
 */
export function Template({
	headline,
	detail,
	consequence,
	diagnosticsUrl,
	manageUrl,
	logoUrl,
}: Props) {
	return (
		<EmailLayout
			preview="Door access needs attention"
			logoUrl={logoUrl}
			manageUrl={manageUrl}
		>
			<Heading style={styles.heading}>
				Door access needs attention
			</Heading>
			<Text style={styles.text}>{headline}</Text>
			<Text style={styles.text}>{detail}</Text>
			<Text style={styles.text}>{consequence}</Text>
			<Link href={diagnosticsUrl} style={styles.button}>
				Open the console
			</Link>
		</EmailLayout>
	);
}
