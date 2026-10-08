import { render } from "@solidjs/testing-library";

import { DatePicker } from "./DatePicker.tsx";

test("closed date picker renders no calendar", () => {
	render(() => <DatePicker label="Date" />);
	expect(
		document.querySelector('[data-scope="date-picker"][data-part="table"]')
	).toBeNull();
});
