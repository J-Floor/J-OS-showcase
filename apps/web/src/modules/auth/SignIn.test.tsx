// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";

const { failed, magicLink } = vi.hoisted(() => ({
	failed: { read: (): boolean => false },
	magicLink: vi.fn(),
}));

function noSession() {
	return { data: null, isPending: false };
}

vi.mock("../../lib/auth.ts", () => ({
	authClient: {
		useSession: () => noSession,
		signIn: { magicLink },
	},
}));
vi.mock("../../lib/convex.ts", () => ({
	ottPending: () => false,
	ottFailed: () => failed.read(),
}));
vi.mock("@solidjs/router", () => ({
	useNavigate: () => vi.fn(),
	Navigate: () => null,
}));

import { SignIn } from "./SignIn.tsx";

afterEach(cleanup);

test("a failed link exchange is told in the email field's error slot", () => {
	const [isFailed] = createSignal(true);
	failed.read = isFailed;
	render(() => <SignIn />);
	expect(
		screen.getByText("That sign-in link didn't work. Send a new one.")
	).toBeInTheDocument();
});

test("no error is shown when the link exchange did not fail", () => {
	failed.read = () => false;
	render(() => <SignIn />);
	expect(screen.queryByText(/sign-in link didn't work/)).toBeNull();
});

test("sending a new link clears the failed-link message for good", async () => {
	failed.read = () => true;
	magicLink.mockResolvedValue({ error: null });
	render(() => <SignIn />);
	const message = "That sign-in link didn't work. Send a new one.";
	expect(screen.getByText(message)).toBeInTheDocument();
	fireEvent.input(screen.getByLabelText("Email"), {
		target: { value: "ada@example.com" },
	});
	fireEvent.submit(screen.getByLabelText("Email").closest("form")!);
	expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
	fireEvent.click(
		screen.getByRole("button", { name: /Use a different email/ })
	);
	expect(screen.queryByText(message)).toBeNull();
});
