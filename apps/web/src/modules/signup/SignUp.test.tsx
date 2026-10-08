// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

afterEach(cleanup);

const mutateAsync = vi.fn();
vi.mock("convex-solidjs", () => ({
	useAction: () => ({ mutateAsync }),
}));

let locationState: {
	firstName?: string;
	lastName?: string;
	email?: string;
} | null = null;
vi.mock("@solidjs/router", () => ({
	useLocation: () => ({ state: locationState }),
}));

import { SignUp } from "./SignUp.tsx";

test("prefills first name, last name, and email from navigation state", () => {
	locationState = {
		firstName: "A",
		lastName: "B",
		email: "a@example.com",
	};

	render(() => <SignUp />);

	expect(screen.getByLabelText("First name")).toHaveValue("A");
	expect(screen.getByLabelText("Last name")).toHaveValue("B");
	expect(screen.getByLabelText("Email")).toHaveValue("a@example.com");
});

test("leaves the fields blank and editable when there is no navigation state", () => {
	locationState = null;

	render(() => <SignUp />);

	expect(screen.getByLabelText("First name")).toHaveValue("");
	expect(screen.getByLabelText("Last name")).toHaveValue("");
	expect(screen.getByLabelText("Email")).toHaveValue("");

	fireEvent.input(screen.getByLabelText("First name"), {
		target: { value: "Changed" },
	});
	expect(screen.getByLabelText("First name")).toHaveValue("Changed");
});

test("after submit, the pending screen says the email explains what to do for someone already in", async () => {
	locationState = null;
	mutateAsync.mockResolvedValue({ status: "pending" });
	window.grecaptcha = {
		ready: (cb) => {
			cb();
		},
		execute: () => Promise.resolve("captcha-token"),
	};

	render(() => <SignUp />);

	function type(label: string, value: string) {
		fireEvent.input(screen.getByLabelText(label), { target: { value } });
	}
	type("First name", "Ada");
	type("Last name", "Lovelace");
	type("Email", "ada@example.com");
	type("Phone (WhatsApp)", "+41 79 000 00 00");
	type("Venture / project name", "Engine Co");
	type("What is your venture/project about?", "Computers.");
	type("What have you built before?", "An engine.");
	type(
		"Link to your profile (LinkedIn, X, GitHub, or site)",
		"https://example.com"
	);
	type("Why do you want to join J floor?", "To build.");

	fireEvent.click(screen.getByRole("combobox", { name: "Product stage" }));
	fireEvent.click(await screen.findByText("Prototype"));
	fireEvent.click(screen.getByRole("combobox", { name: "Funding stage" }));
	fireEvent.click(await screen.findByText("Bootstrapped (not raised)"));
	fireEvent.click(
		screen.getByRole("combobox", { name: "Industry / vertical" })
	);
	fireEvent.click(await screen.findByText("AI / ML"));
	await screen.findByRole("button", { name: "Remove AI / ML" });

	fireEvent.submit(
		screen
			.getByRole("button", { name: /Submit application/ })
			.closest("form")!
	);

	expect(
		await screen.findByText(
			/Already have access, or an application in review\? The email tells you what to do instead\./
		)
	).toBeInTheDocument();
	expect(mutateAsync).toHaveBeenCalledOnce();
	delete window.grecaptcha;
});
