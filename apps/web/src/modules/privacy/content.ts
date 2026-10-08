// J floor privacy policy shown at /privacy and linked from the onboarding
// document step. Source of truth for the policy text; update here when revised.
import {
	CONTACT_EMAIL,
	ORG_LEGAL_NAME,
	ORG_LOCATION,
} from "../../lib/constants.ts";

export const PRIVACY_META = {
	org: `${ORG_LEGAL_NAME} · ${ORG_LOCATION}`,
	governingLaw: "Swiss Federal Act on Data Protection (nDSG)",
	updated: "October 2026",
};

export type PrivacyBlock =
	| { kind: "p"; lead?: string; text: string }
	| { kind: "list"; items: string[] };

export const PRIVACY_SECTIONS: readonly {
	id: string;
	heading: string;
	blocks: PrivacyBlock[];
}[] = [
	{
		id: "who-we-are",
		heading: "1. Who we are",
		blocks: [
			{
				kind: "p",
				text: "J floor is a Swiss association (Verein) registered under Art. 60 ff. of the Swiss Civil Code, operating a community workspace for early-stage founders in Zurich. J floor is the data controller responsible for the personal data described in this policy. The J floor Board acts as the responsible body for data protection matters on behalf of the association.",
			},
			{ kind: "p", text: `You can reach us at: ${CONTACT_EMAIL}` },
		],
	},
	{
		id: "what-we-collect",
		heading: "2. What data we collect",
		blocks: [
			{
				kind: "p",
				text: "We collect only what is necessary to run the community and administer your membership. This includes:",
			},
			{
				kind: "list",
				items: [
					"Name and company name",
					"Professional email address",
					"A brief description of what you are building and your current stage",
					"Door access log: each door unlock or lock from the app, and each access grant or revocation, with your name, email, the door, the time and the outcome",
					"Wi-Fi: the time you first opened the Wi-Fi details in the app (we do not record Wi-Fi connections or track people with door sensors)",
					"Correspondence: communications between you and the Board",
				],
			},
			{
				kind: "p",
				text: "We do not collect phone numbers, personal social media profiles, or financial information unless you provide these voluntarily for a specific purpose. Most personal data is collected directly from you. The door access log and the Wi-Fi record are generated automatically when you use the app.",
			},
		],
	},
	{
		id: "applicants-visitors",
		heading: "3. Applicants and event visitors",
		blocks: [
			{
				kind: "p",
				text: "This section covers you if you apply to join J floor or register as a visitor to one of our events, before you become a member.",
			},
			{
				kind: "p",
				lead: "What we collect when you apply.",
				text: "Your name, email address and phone number; your venture or project name, what it does, its product and funding stage, team size and industry; what you have built before and why you want to join; the profile links you give us; and who referred you, if anyone. The Board adds its own assessment notes and score.",
			},
			{
				kind: "p",
				lead: "What we collect when you register for an event.",
				text: "Your name, your email address, and which event you registered for and attended.",
			},
			{
				kind: "p",
				lead: "Why.",
				text: "To assess your application and reply to you, or to let you into the event and give you Wi-Fi access. Both forms are checked by Google reCAPTCHA to keep out spam, and the profile links in an application are checked against Google Safe Browsing for malware and phishing.",
			},
			{
				kind: "p",
				lead: "How long.",
				text: "If you never confirm your email address, we delete your submission after 7 days. A confirmed application is kept until the Board decides on it, and then as described in Section 7. A confirmed event registration is kept for as long as we need it to run our events. You can ask us to delete your data at any time (Section 8).",
			},
		],
	},
	{
		id: "why-we-collect",
		heading: "4. Why we collect it",
		blocks: [
			{
				kind: "p",
				text: "We process your personal data for the following purposes:",
			},
			{
				kind: "p",
				lead: "Membership administration.",
				text: "To manage your membership, grant or revoke access, and communicate with you about your membership status.",
			},
			{
				kind: "p",
				lead: "Space access and security.",
				text: "To operate the digital access platform and ensure the security of the space.",
			},
			{
				kind: "p",
				lead: "Community management.",
				text: "To understand who is in the community, facilitate connections, and maintain the quality of the membership.",
			},
			{
				kind: "p",
				lead: "Sponsor reporting.",
				text: "To provide our sponsors with limited, non-sensitive information about the community as described in Section 5. This is disclosed to you at the time of membership and forms part of the basis on which the space is funded.",
			},
			{
				kind: "p",
				lead: "Legal obligations.",
				text: "Our processing of personal data is based on the performance of the membership agreement, the legitimate interests of the association (including security, community management, and funding through sponsors), compliance with legal obligations under Swiss law, and, where applicable, your consent.",
			},
		],
	},
	{
		id: "sponsors",
		heading: "5. What we share with sponsors",
		blocks: [
			{
				kind: "p",
				text: "J floor is funded by sponsors who support the founder ecosystem. In exchange for their support, sponsors receive limited visibility into the community. Specifically, we share with sponsors:",
			},
			{
				kind: "list",
				items: [
					"Your name",
					"Your company name",
					"A brief description of what you are building",
					"Your current stage",
					"Your professional email address",
				],
			},
			{
				kind: "p",
				text: "This information is included in quarterly reports provided to sponsors.",
			},
			{
				kind: "p",
				text: "We do not share your phone number, personal social media, or any other contact details with sponsors without your explicit consent. Sponsors will not contact you directly unless you have opted in at the time of signing your membership agreement.",
			},
			{
				kind: "p",
				text: "Only current members are included in sponsor reports.",
			},
		],
	},
	{
		id: "service-providers",
		heading: "6. Service providers",
		blocks: [
			{
				kind: "p",
				text: "We use these service providers to run the app, the website and the space. Each receives only what it needs for the purpose listed:",
			},
			{
				kind: "list",
				items: [
					"Convex, Inc. (USA): our database and backend. Holds all the data described in this policy. Our deployment is hosted in the EU (Ireland).",
					"Resend, Inc. (USA): sends our emails. Receives your name, email address and the content of each email we send you.",
					"Cloudflare, Inc. (USA, global network): network, security and DNS for the app and the website. Receives your IP address and request data when you visit.",
					"Google LLC (USA): reCAPTCHA spam protection on the application and visitor forms (your IP address and browser data); and a Safe Browsing check of the links you add to an application or profile (the links).",
					"Hetzner Online GmbH (Germany, EU): hosts the files of the web app. Receives your IP address and request data.",
					"Our door-lock provider (Austria, EU): opens the doors. Receives your name on your door authorisation and the lock and unlock actions.",
					"Browser push services (Google, Apple or Mozilla, chosen by your browser; USA): only if you turn on notifications. Receive a device address and an encrypted notification.",
				],
			},
			{
				kind: "p",
				text: "Where a provider processes data outside Switzerland and the EEA, the transfer relies on the provider's contractual safeguards (the EU Standard Contractual Clauses as recognised by the FDPIC) or, where the provider is certified, the Swiss-US Data Privacy Framework.",
			},
			{
				kind: "p",
				text: "We do not sell your personal data to any third party.",
			},
		],
	},
	{
		id: "retention",
		heading: "7. How long we keep your data",
		blocks: [
			{
				kind: "p",
				text: "We retain your personal data for as long as your membership is active and for a reasonable period thereafter to comply with legal obligations, resolve disputes, or enforce our agreements.",
			},
			{
				kind: "p",
				text: "The door access log and the Wi-Fi record are deleted automatically after 12 months, unless a longer retention period is required by law or for the investigation of a security incident.",
			},
			{
				kind: "p",
				text: "If you request deletion of your data, we will erase it to the extent we are not required to retain it by law.",
			},
		],
	},
	{
		id: "your-rights",
		heading: "8. Your rights",
		blocks: [
			{
				kind: "p",
				text: "Under the Swiss Federal Act on Data Protection (nDSG), you have the right to:",
			},
			{
				kind: "list",
				items: [
					"Access the personal data we hold about you",
					"Request correction of inaccurate data",
					"Request deletion of your data, subject to legal retention obligations",
					"Object to processing in certain circumstances",
					"Receive your data in a portable format where technically feasible",
				],
			},
			{
				kind: "p",
				text: `To exercise any of these rights, send a written request to the Board at ${CONTACT_EMAIL}. We will respond within 30 days. In complex cases, we may extend this by a further 30 days and will notify you accordingly.`,
			},
			{
				kind: "p",
				text: "We do not carry out automated individual decision-making or profiling that produces legal or similarly significant effects within the meaning of the nDSG.",
			},
			{
				kind: "p",
				text: "If you believe we have not handled your data correctly, you have the right to lodge a complaint with the Swiss Federal Data Protection and Information Commissioner (FDPIC) at www.edoeb.admin.ch.",
			},
		],
	},
	{
		id: "security",
		heading: "9. Security",
		blocks: [
			{
				kind: "p",
				text: "We take reasonable technical and organisational measures to protect your personal data against unauthorised access, loss, or misuse. Access to membership data is restricted to Board members and authorised volunteers on a need-to-know basis.",
			},
			{
				kind: "p",
				text: `No system is completely secure. If you believe your data has been compromised, please contact us immediately at ${CONTACT_EMAIL}.`,
			},
		],
	},
	{
		id: "changes",
		heading: "10. Changes to this policy",
		blocks: [
			{
				kind: "p",
				text: "We may update this Privacy Policy from time to time. When we do, we will notify members by email with reasonable notice before the changes take effect. The current version is always available on this page.",
			},
			{
				kind: "p",
				text: "Continued use of the J floor space after an update takes effect constitutes acceptance of the revised policy.",
			},
		],
	},
	{
		id: "contact",
		heading: "11. Contact",
		blocks: [
			{
				kind: "p",
				text: "For any questions about this Privacy Policy or how we handle your data, contact the J floor Board at:",
			},
			{ kind: "p", lead: CONTACT_EMAIL, text: "" },
			{ kind: "p", text: `${ORG_LEGAL_NAME}, ${ORG_LOCATION}` },
			{
				kind: "p",
				text: "This Privacy Policy is governed by Swiss law. It supplements the J floor Membership Agreement and should be read alongside it.",
			},
			{
				kind: "p",
				text: "Not legal advice. J floor recommends periodic review by a qualified Swiss data protection professional.",
			},
		],
	},
];
