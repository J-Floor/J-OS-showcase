import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";

import { Segment } from "./Segment.tsx";

describe("Segment", () => {
	it("selects an item and reflects checked state", async () => {
		function Harness() {
			const [value, setValue] = createSignal("member");
			return (
				<Segment.Root
					value={value()}
					onValueChange={(d) => setValue(d.value ?? "")}
				>
					<Segment.Item value="board">Board</Segment.Item>
					<Segment.Item value="member">Member</Segment.Item>
				</Segment.Root>
			);
		}
		render(() => <Harness />);
		// ark renders ItemHiddenInput as a radio <input>; click it to trigger the
		// zag radio-group machine; getByRole("radio") guarantees it's an input
		const radios = screen.getAllByRole<HTMLInputElement>("radio");
		const boardRadio = radios.find((r) => r.value === "board");
		if (!boardRadio) throw new Error("board radio not found");
		fireEvent.click(boardRadio);
		// zag dispatches state updates asynchronously; wait for the item to reflect
		const boardItem = boardRadio.closest('[data-part="item"]');
		await waitFor(() => {
			expect(boardItem?.getAttribute("data-state")).toBe("checked");
		});
	});
});
