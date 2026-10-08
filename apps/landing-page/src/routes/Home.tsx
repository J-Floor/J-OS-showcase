import { FirstMonths } from "./home/first-months/FirstMonths.tsx";
import { FooterCta } from "./home/footer-cta/FooterCta.tsx";
import { Hero } from "./home/hero/Hero.tsx";
import { PoweredBy } from "./home/powered-by/PoweredBy.tsx";
import { SiteFooter } from "./home/site-footer/SiteFooter.tsx";
import { WhoWeAre } from "./home/who-we-are/WhoWeAre.tsx";

/** Home page — the sections are rebuilt one-per-component from the live J floor
 * site and composed here in the order they appear on thejfloor.com.
 *
 * The `HowWeWork`, `Testimonials`, and `SiteHeader` components exist in the tree
 * but are intentionally NOT mounted: those are hidden/draft in Framer and do not
 * render on the live published page, so composing them would diverge from the
 * site we are mirroring. They are kept for when that content goes live. */
export function Home() {
	return (
		<>
			<main>
				<Hero />
				<WhoWeAre />
				<FirstMonths />
			</main>
			<FooterCta />
			<PoweredBy />
			<SiteFooter />
		</>
	);
}
