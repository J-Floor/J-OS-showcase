export type AgreementsError =
	| { type: "AgreementAlreadySigned" }
	| { type: "SignatureTooLarge" }
	| { type: "SignatureNotPng" }
	| { type: "SignatureSizeInvalid" }
	| { type: "AgreementUnprintable" };

export const agreementsMessages: Record<AgreementsError["type"], string> = {
	AgreementAlreadySigned: "Agreement already signed.",
	SignatureTooLarge: "Signature image is too large.",
	SignatureNotPng: "Signature must be a PNG image.",
	SignatureSizeInvalid: "Signature image is empty or too large.",
	AgreementUnprintable:
		"Your details contain characters the agreement cannot print.",
};
