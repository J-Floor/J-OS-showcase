// @vitest-environment happy-dom
import { HOVER_INTENT_MS, MORPH_OF, MORPH_OPENER } from "@j-os/design-system";
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, expect, test, vi } from "vitest";

import { PersonListItem } from "./PersonListItem.tsx";

afterEach(cleanup);

test("renders the name, the detail line and the trailing slot", () => {
	render(() => (
		<PersonListItem name="Ada Example" detail="ada@example.com">
			<span>Pending</span>
		</PersonListItem>
	));
	expect(screen.getByText("Ada Example")).toBeInTheDocument();
	expect(screen.getByText("ada@example.com")).toBeInTheDocument();
	expect(screen.getByText("Pending")).toBeInTheDocument();
});

test("renders no detail line or trailing slot when none is given", () => {
	const { container } = render(() => <PersonListItem name="Bea Example" />);
	expect(screen.getByText("Bea Example")).toBeInTheDocument();
	// Avatar and the name column only: no trailing slot.
	expect(container.firstElementChild?.children).toHaveLength(2);
});

test("builds the trailing content once", () => {
	let builds = 0;
	function Trailing() {
		builds += 1;
		return <span>Pending</span>;
	}
	render(() => (
		<PersonListItem name="Cy Example">
			<Trailing />
		</PersonListItem>
	));
	expect(builds).toBe(1);
});

test("without an opener the row is no button and morphs as nothing", () => {
	const { container } = render(() => (
		<PersonListItem name="Dee Example" detail="dee@example.com" />
	));
	expect(screen.queryByRole("button")).toBeNull();
	expect(container.querySelector(`[${MORPH_OF}]`)).toBeNull();
});

test("with an opener a click on the person opens them", () => {
	const open = vi.fn();
	render(() => (
		<PersonListItem name="Eve Example" open={open} morphOf="person1" />
	));
	fireEvent.click(screen.getByRole("button", { name: /Eve Example/ }));
	expect(open).toHaveBeenCalledTimes(1);
});

test("the opener is a real button, so Enter and Space open the person", () => {
	const open = vi.fn();
	render(() => <PersonListItem name="Fay Example" open={open} />);
	const button = screen.getByRole("button", { name: /Fay Example/ });
	expect(button.tagName).toBe("BUTTON");
	expect(button).toHaveAttribute("type", "button");
	button.focus();
	expect(button).toHaveFocus();
});

test("the whole row morphs as the record it opens", () => {
	render(() => (
		<PersonListItem name="Gil Example" open={() => {}} morphOf="request1">
			<span>Pending</span>
		</PersonListItem>
	));
	const row = screen
		.getByRole("button", { name: /Gil Example/ })
		.closest(`[${MORPH_OF}]`);
	expect(row).toHaveAttribute(MORPH_OF, "request1");
	expect(row).toContainElement(screen.getByText("Pending"));
});

test("the person is the row's opener, so the row's record grows out of the whole row", () => {
	render(() => (
		<PersonListItem name="Hal Example" open={() => {}} morphOf="p1" />
	));
	expect(screen.getByRole("button", { name: /Hal Example/ })).toHaveAttribute(
		MORPH_OPENER
	);
});

test("without a morph the person is no row's opener", () => {
	render(() => <PersonListItem name="Hal Example" open={() => {}} />);
	expect(
		screen.getByRole("button", { name: /Hal Example/ })
	).not.toHaveAttribute(MORPH_OPENER);
});

test("the trailing slot stays outside the opener: using it opens nothing", () => {
	const open = vi.fn();
	render(() => (
		<PersonListItem name="Hal Example" open={open}>
			<button type="button">Status</button>
		</PersonListItem>
	));
	const status = screen.getByRole("button", { name: "Status" });
	expect(
		screen.getByRole("button", { name: /Hal Example/ })
	).not.toContainElement(status);
	fireEvent.click(status);
	expect(open).not.toHaveBeenCalled();
});

test("a press on the person warms what it opens, a touch included: a touch has no hover", () => {
	const warm = vi.fn();
	render(() => (
		<PersonListItem
			name="Fay Example"
			open={() => {}}
			warm={warm}
			morphOf="person2"
		/>
	));
	expect(warm).not.toHaveBeenCalled();
	fireEvent.pointerDown(screen.getByRole("button", { name: /Fay Example/ }), {
		pointerType: "touch",
	});
	expect(warm).toHaveBeenCalledTimes(1);
});

test("resting the pointer on the person warms what it opens", () => {
	vi.useFakeTimers();
	try {
		const warm = vi.fn();
		render(() => (
			<PersonListItem name="Gus Example" open={() => {}} warm={warm} />
		));
		fireEvent.pointerEnter(
			screen.getByRole("button", { name: /Gus Example/ }),
			{ pointerType: "mouse" }
		);
		expect(warm).not.toHaveBeenCalled();
		vi.advanceTimersByTime(HOVER_INTENT_MS);
		expect(warm).toHaveBeenCalledTimes(1);
	} finally {
		vi.useRealTimers();
	}
});
