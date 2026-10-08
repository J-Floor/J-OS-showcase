// apps/web/convex/emails/generated.test.ts
import { describe, expect, it } from "vitest";

import { applicationReceived } from "./generated/applicationReceived.ts";
import { approvalGuest } from "./generated/approvalGuest.ts";
import { boardNewApplication } from "./generated/boardNewApplication.ts";
import { magicLink } from "./generated/magicLink.ts";
import { notice } from "./generated/notice.ts";
import { taskAssigned } from "./generated/taskAssigned.ts";
import { verifyApplication } from "./generated/verifyApplication.ts";
import { verifyVisitor } from "./generated/verifyVisitor.ts";

describe("generated email joiners", () => {
	it("injects values into the HTML and the text part", () => {
		const { html, text } = applicationReceived({
			name: "Ada",
			logoUrl: "https://app.example.com/email/logo.png",
		});
		expect(html).toContain("Ada");
		expect(html).toContain("https://app.example.com/email/logo.png");
		expect(text).toContain("Ada");
	});

	it("escapes HTML in the HTML part but not the text part", () => {
		const { html, text } = applicationReceived({
			name: "<script>alert(1)</script> A & B",
			logoUrl: "https://app.example.com/email/logo.png",
		});
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<script>alert(1)</script>");
		expect(html).toContain("A &amp; B");
		// Plain-text keeps raw values (no entity encoding).
		expect(text).toContain("<script>alert(1)</script>");
		expect(text).toContain("A & B");
	});
});

describe("more generated joiners", () => {
	it("puts the magic-link URL into the button href (escaped)", () => {
		const { html } = magicLink({
			url: "https://x.co/verify?token=a&b=c",
			logoUrl: "https://x.co/email/logo.png",
		});
		// & is entity-encoded in the attribute; the link is present.
		expect(html).toContain("https://x.co/verify?token=a&amp;b=c");
	});

	it("renders the guest window dates", () => {
		const { html, text } = approvalGuest({
			name: "Ada",
			fromDate: "18 June 2026",
			untilDate: "18 September 2026",
			signinUrl: "https://x.co/signin",
			logoUrl: "https://x.co/email/logo.png",
		});
		expect(html).toContain("18 June 2026");
		expect(html).toContain("18 September 2026");
		expect(text).toContain("18 September 2026");
	});

	it("injects the confirm URL into the verify-application email and nothing the applicant typed", () => {
		const { html, text } = verifyApplication({
			confirmUrl: "https://app.example.com/apply/confirm?token=abc",
			logoUrl: "https://app.example.com/email/logo.png",
		});
		expect(html).toContain(
			"https://app.example.com/apply/confirm?token=abc"
		);
		expect(text).toContain(
			"https://app.example.com/apply/confirm?token=abc"
		);
		expect(html).toContain("Confirm your application");
		expect(text).not.toContain("You applied as");
		expect(html).not.toContain("You applied as");
	});

	it("injects applicantName, venture, and reviewUrl into the board-new-application email", () => {
		const { html, text } = boardNewApplication({
			applicantName: "Jane Doe",
			venture: "Acme Corp",
			reviewUrl: "https://app.example.com/admin",
			manageUrl: "https://app.example.com/?notifications=open",
			logoUrl: "https://app.example.com/email/logo.png",
		});
		expect(html).toContain("Jane Doe");
		expect(html).toContain("Acme Corp");
		expect(html).toContain("https://app.example.com/admin");
		expect(text).toContain("Jane Doe");
		expect(text).toContain("Acme Corp");
		expect(text).toContain("https://app.example.com/admin");
	});

	it("injects the confirm URL into the verify-visitor email", () => {
		const { html, text } = verifyVisitor({
			confirmUrl: "https://app.example.com/visitor/confirm?token=abc",
			logoUrl: "https://app.example.com/email/logo.png",
		});
		expect(html).toContain(
			"https://app.example.com/visitor/confirm?token=abc"
		);
		expect(text).toContain(
			"https://app.example.com/visitor/confirm?token=abc"
		);
	});
});

describe("notification emails", () => {
	it("renders the generic notice with its button and the manage link", () => {
		const { html, text } = notice({
			heading: "Demo Night starts at 18:00",
			body: "Hi Ada, Demo Night starts at 18:00.",
			ctaLabel: "View the event",
			ctaUrl: "https://x.co/events?event=e1",
			manageUrl: "https://x.co/?notifications=open",
			logoUrl: "https://x.co/email/logo.png",
		});
		expect(html).toContain("Demo Night starts at 18:00");
		expect(html).toContain("https://x.co/events?event=e1");
		expect(html).toContain("Manage notifications");
		expect(html).toContain("https://x.co/?notifications=open");
		expect(text).toContain("https://x.co/?notifications=open");
	});

	it("puts the manage link on the task-assigned email", () => {
		const { html } = taskAssigned({
			name: "Ada",
			taskTitle: "Wire it",
			viewUrl: "https://x.co/tasks?task=t1",
			manageUrl: "https://x.co/?notifications=open",
			logoUrl: "https://x.co/email/logo.png",
		});
		expect(html).toContain("Manage notifications");
		expect(html).toContain("https://x.co/?notifications=open");
	});
});
