import { fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";

import { SearchInput } from "./SearchInput.tsx";

function Harness() {
	const [q, setQ] = createSignal("");
	return (
		<SearchInput
			label=""
			aria-label="Search rules"
			value={q()}
			onValueChange={setQ}
		/>
	);
}

test("reports typed text as a plain string", () => {
	let got = "";
	render(() => (
		<SearchInput
			label=""
			aria-label="Q"
			value=""
			onValueChange={(v) => (got = v)}
		/>
	));
	fireEvent.input(screen.getByRole("searchbox"), {
		target: { value: "dish" },
	});
	expect(got).toBe("dish");
});

test("shows the search icon", () => {
	render(() => (
		<SearchInput
			label=""
			aria-label="Q"
			value=""
			onValueChange={() => {}}
		/>
	));
	const icon = document.querySelector("[data-icon]");
	expect(icon).toHaveTextContent("search");
});

test("hands the input element to a consumer ref", () => {
	let el: HTMLInputElement | undefined;
	render(() => (
		<SearchInput
			label=""
			aria-label="Q"
			value=""
			ref={(e: HTMLInputElement) => (el = e)}
			onValueChange={() => {}}
		/>
	));
	expect(el).toBe(screen.getByRole("searchbox"));
});

test("applies a consumer class alongside its own", () => {
	render(() => (
		<SearchInput
			label=""
			aria-label="Q"
			value=""
			class="consumer"
			onValueChange={() => {}}
		/>
	));
	const cls = screen.getByRole("searchbox").closest(".consumer")?.className;
	expect(cls).toBeDefined();
	expect(cls?.split(/\s+/).length).toBeGreaterThan(1);
});

test("offers a clear button only once there is something to clear", () => {
	render(() => <Harness />);
	expect(screen.queryByLabelText("Clear search")).toBeNull();
	fireEvent.input(screen.getByRole("searchbox"), {
		target: { value: "dish" },
	});
	fireEvent.click(screen.getByLabelText("Clear search"));
	expect(screen.getByRole("searchbox")).toHaveValue("");
	expect(screen.queryByLabelText("Clear search")).toBeNull();
});

test("clearing puts the caret back in the field", () => {
	render(() => <Harness />);
	fireEvent.input(screen.getByRole("searchbox"), { target: { value: "x" } });
	fireEvent.click(screen.getByLabelText("Clear search"));
	expect(screen.getByRole("searchbox")).toHaveFocus();
});
