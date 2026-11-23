// @vitest-environment happy-dom
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { ConvexError } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";

import { AbilityProvider } from "../../lib/ability.tsx";

import { TvPairRoute } from "./TvPairPage.tsx";

const { status, queries, approve } = vi.hoisted(() => ({
	status: { value: undefined as string | undefined },
	queries: [] as string[],
	approve: vi.fn(),
}));

vi.mock("convex-solidjs", async () => {
	const { getFunctionName } = await import("convex/server");
	return {
		useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
			queries.push(getFunctionName(reference));
			return {
				data: () => status.value,
				error: () => {},
				isLoading: () => false,
			};
		},
		useMutation: () => ({ mutateAsync: approve }),
		useConvexClient: () => ({ query: () => new Promise(() => {}) }),
	};
});

afterEach(() => {
	cleanup();
	status.value = undefined;
	queries.length = 0;
	approve.mockReset();
});

const CODE = "abcd1234secretrest";

function renderPage(role: "board" | "member", url = `/tv/pair?code=${CODE}`) {
	const history = createMemoryHistory();
	history.set({ value: url });
	return render(() => (
		<MemoryRouter history={history}>
			<Route
				path="/tv/pair"
				component={() => (
					<AbilityProvider role={role}>
						<TvPairRoute noAccess={<p>no access</p>} />
					</AbilityProvider>
				)}
			/>
		</MemoryRouter>
	));
}

test("no code is an invalid link and asks nothing", () => {
	renderPage("board", "/tv/pair");
	expect(
		screen.getByText("This pairing link is not valid.")
	).toBeInTheDocument();
	expect(queries).toEqual([]);
});

test("a pending code shows only its 4-char check code and a default label", () => {
	status.value = "pending";
	const { container } = renderPage("board");
	expect(screen.getByLabelText("Check code").textContent).toBe("ABCD");
	expect(container.innerHTML).not.toMatch(/secretrest/i);
	expect(screen.getByLabelText("Name")).toHaveValue("Space TV");
	expect(screen.getByRole("button", { name: /Confirm/ })).toBeEnabled();
});

test("confirming approves the code with the label, then links back to Space", async () => {
	status.value = "pending";
	approve.mockResolvedValue(undefined);
	renderPage("board");
	fireEvent.input(screen.getByLabelText("Name"), {
		target: { value: "Lobby TV" },
	});
	fireEvent.click(screen.getByRole("button", { name: /Confirm/ }));
	expect(await screen.findByText("TV paired")).toBeInTheDocument();
	expect(approve).toHaveBeenCalledWith({ code: CODE, label: "Lobby TV" });
	expect(screen.getByRole("link")).toHaveAttribute("href", "/space?tab=tv");
});

test("a refused approval shows the server's message and stays on the form", async () => {
	status.value = "pending";
	approve.mockRejectedValue(
		new ConvexError({ code: "TvPairingExpired", message: "Too late." })
	);
	renderPage("board");
	fireEvent.click(screen.getByRole("button", { name: /Confirm/ }));
	expect(await screen.findByText("Too late.")).toBeInTheDocument();
	expect(screen.queryByText("TV paired")).not.toBeInTheDocument();
});

test.each([
	["expired", "This pairing link has expired. Reload the TV for a new code."],
	["used", "This TV is already paired."],
	["unknown", "This pairing link is not valid."],
])("a %s code says so and offers no Confirm", (value, message) => {
	status.value = value;
	renderPage("board");
	expect(screen.getByText(message)).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /Confirm/ })
	).not.toBeInTheDocument();
});

test("a blank label disables Confirm", () => {
	status.value = "pending";
	renderPage("board");
	fireEvent.input(screen.getByLabelText("Name"), { target: { value: "  " } });
	expect(screen.getByRole("button", { name: /Confirm/ })).toBeDisabled();
	expect(approve).not.toHaveBeenCalled();
});

test("a member gets no access and the status is never asked", () => {
	status.value = "pending";
	renderPage("member");
	expect(screen.getByText("no access")).toBeInTheDocument();
	expect(queries).toEqual([]);
});
