export function devAdminEmail() {
	const email = process.env.DEV_ADMIN_EMAIL;
	return email === undefined || email === "" ? "admin@example.com" : email;
}
