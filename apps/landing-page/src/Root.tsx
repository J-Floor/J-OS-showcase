import { Route, Router } from "@solidjs/router";

import { App } from "./App.tsx";
import { Contact } from "./routes/Contact.tsx";
import { Home } from "./routes/Home.tsx";
import { NotFound } from "./routes/NotFound.tsx";

/** The whole site, shared by the browser entry and the build-time prerender.
 * `url` is only passed on the server, where there is no `location` to read. */
export function Root(props: { url?: string }) {
	return (
		<Router root={App} url={props.url}>
			<Route path="/" component={Home} />
			<Route path="/contact" component={Contact} />
			<Route path="*" component={NotFound} />
		</Router>
	);
}
