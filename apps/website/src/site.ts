export const site = {
	name: "J floor",
	origin: "https://thejfloor.com",
	apply: "https://app.thejfloor.com/sign-up",
	email: "contact@thejfloor.com",
	linkedin: "https://www.linkedin.com/company/j-floor/",
	privacy: "https://app.thejfloor.com/privacy",
	contact: "/contact",
	luma: "https://luma.com/user/jfloor",
	street: "Josefstrasse 206",
	locality: "8005 Zürich, Switzerland",
	registration: "CHE-319.745.061",
};
export function pageMeta(path: string) {
	if (path === "/")
		return {
			title: "J floor — A builders house. Rooted in Zurich.",
			description:
				"A private community of builders, researchers, and founders sharing ambition, ideas, and a physical home in Zurich.",
		};
	return path === "/contact"
		? {
				title: "Contact — J floor",
				description:
					"Get in touch with J floor, a private builders community in Zurich.",
			}
		: {
				title: "Page not found — J floor",
				description: "Find your way back to the J floor community.",
			};
}
