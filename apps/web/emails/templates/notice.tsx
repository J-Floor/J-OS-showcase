import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	heading: string;
	body: string;
	ctaLabel: string;
	ctaUrl: string;
	manageUrl: string;
	logoUrl: string;
};

/**
 * The generic notification email: one heading, one paragraph, one button, and
 * the manage-notifications footer. Every notification kind without a bespoke
 * template renders through this one (guest expiry/changes).
 */
export function Template({
	heading,
	body,
	ctaLabel,
	ctaUrl,
	manageUrl,
	logoUrl,
}: Props) {
	return (
		<EmailLayout preview={heading} logoUrl={logoUrl} manageUrl={manageUrl}>
			<Heading style={styles.heading}>{heading}</Heading>
			<Text style={styles.text}>{body}</Text>
			<Link href={ctaUrl} style={styles.button}>
				{ctaLabel}
			</Link>
		</EmailLayout>
	);
}
