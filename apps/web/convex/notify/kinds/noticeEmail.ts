import { notice } from "../../emails/generated/notice.ts";
import { emailUrls, manageNotificationsUrl } from "../../emails/urls.ts";

/** The one-button notification mail every guest kind sends. */
export function noticeEmail({
	title,
	body,
	url,
}: {
	title: string;
	body: string;
	url: string;
}): { subject: string; html: string; text: string } {
	const { html, text } = notice({
		heading: title,
		body,
		ctaLabel: "Open J floor",
		ctaUrl: url,
		manageUrl: manageNotificationsUrl(),
		logoUrl: emailUrls().logoUrl,
	});
	return { subject: title, html, text };
}
