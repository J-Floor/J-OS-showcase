export const EMAIL_DOMAINS: readonly string[] = [
  "example.com",
  "example.org",
  "jfloor.test",
  "resend.dev",
];

export const EMAIL_ADDRESSES: readonly string[] = [
  "actions@github.com",
  "git@github.com",
  "noreply@github.com",
  "board@thejfloor.com",
  "contact@thejfloor.com",
  "mirror@thejfloor.com",
];

export type DeniedUrlHost = {
  host: string;
  path?: RegExp;
  placeholderPhonePath?: boolean;
};

export const DENIED_URL_HOSTS: readonly DeniedUrlHost[] = [
  { host: "chat.whatsapp.com" },
  { host: "wa.me", path: /^\/\+?\d/, placeholderPhonePath: true },
  { host: "goo.gl" },
  { host: "*.goo.gl" },
  { host: "drive.google.com" },
  { host: "docs.google.com" },
  { host: "calendar.google.com" },
  { host: "meet.google.com" },
  { host: "notion.so" },
  { host: "*.notion.so" },
  { host: "*.notion.site" },
  { host: "slack.com" },
  { host: "*.slack.com" },
  { host: "zoom.us", path: /^\/j\// },
  { host: "*.zoom.us", path: /^\/j\// },
];

/** People deliberately credited in public; the gate ignores every denylist hash their name forms produce. */
export const ALLOWED_NAMES: readonly string[] = ["Stanislas Laurent"];

export const ALLOWED_URLS: readonly string[] = [
  "https://chat.whatsapp.com/EXAMPLEINVITE",
];

export const ALLOWED_IPV4: readonly string[] = [
  "192.0.2.0/24",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "10.0.0.0/8",
  "127.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
];

export const ALLOWED_IPV6: readonly string[] = ["2001:db8::/32"];

export const BINARIES: readonly { path: string; sha256: string }[] = [
  {
    path: "packages/design-system/src/styles/material-symbols-sharp-subset.woff2",
    sha256: "52625878cb039798a267b0f654864d9db37c1ce2e6f3b1d1027e2d731d97c79d",
  },
  {
    path: "apps/landing-page/public/apple-touch-icon.png",
    sha256: "b8df7f63c9dc2494e1086b43c64679136eb57d7da4393b1f817e28b1a7e01525",
  },
  {
    path: "apps/landing-page/public/assets/3cfLVdnEsG8wFh3JIG8cM4tzw0.webp",
    sha256: "c32d34b6ddc18ce018a5da6ad879d92dbb24efd6a0786dee98982d284faf8142",
  },
  {
    path: "apps/landing-page/public/assets/8yCCNbDpN3ooyUeuVY6dWzytrB0.webp",
    sha256: "f6a28e645cd3ad47ae1ddd99a276f03992aad6caefd4c8f98761d6952fe8a5b4",
  },
  {
    path: "apps/landing-page/public/assets/CsnGVvvq637deUILGhurxlplvug.webp",
    sha256: "9389825f144fd4db2b4fe0f2b926bcf95bd8212ee971003408c85d0d3a26eca1",
  },
  {
    path: "apps/landing-page/public/assets/eZifvSGGqSh0Vwk5J71T7ubpijs.webp",
    sha256: "faf6bd34218db8f1f97e12095173508f3a4a58f6ba49ebbc533552bb35692f3a",
  },
  {
    path: "apps/landing-page/public/assets/gR3L2z4YQvhXAuZ2fzOicMdBq0.webp",
    sha256: "144d43658eb3e6f97975c71d854178d7bcb213f0ee29d4700cab51c7cf4f3374",
  },
  {
    path: "apps/landing-page/public/assets/logos/arc-investors.webp",
    sha256: "7c24e8d6d364549dd0a81807c20090c211f1efaa81f09303692893488e151a38",
  },
  {
    path: "apps/landing-page/public/assets/logos/earthling-vc.webp",
    sha256: "5d297ecd301cf8a0ae68145e2cca9e58cffd75655f8cc17afc95e814eae1cce3",
  },
  {
    path: "apps/landing-page/public/assets/logos/nemu-and-co.webp",
    sha256: "350b2ef81fd9ca8cab5e3eecf8fc4dcb58a9882cf021a833aede9e5b61ac2e24",
  },
  {
    path: "apps/landing-page/public/assets/logos/project-a.webp",
    sha256: "923df9c109a2d052db7329d88829b65e9f030b1f170cc3365e608a6d4c32ea7e",
  },
  {
    path: "apps/landing-page/public/assets/logos/swisscom.webp",
    sha256: "5d5b310a1a8750b6302c5ca2e78a81ddbeaea45bfe0a5ba1d99651398d23dbdd",
  },
  {
    path: "apps/landing-page/public/og-image.png",
    sha256: "195164e2225b6a1da55d754e87a8fad68da2d946707c30f302ee02b84bfcfdb0",
  },
  {
    path: "apps/web/agreements/fonts/AzeretMono.ttf",
    sha256: "f13962c26c1baa864aff7768364001f9bca6e506f41b9a3037c0d6a31e2ca736",
  },
  {
    path: "apps/web/agreements/fonts/Manrope.ttf",
    sha256: "d0639be45d0af36e798172419d7bd173c4bd4f29e2b76cbb69db1d11bf8b0a40",
  },
  {
    path: "apps/web/agreements/static-fonts/AzeretMono-Regular.ttf",
    sha256: "4b4b6ab357f28a0293f81e8fdfcbafe82f068aeb57c2aec1c87a1dabb30f64b3",
  },
  {
    path: "apps/web/agreements/static-fonts/Manrope-Bold.ttf",
    sha256: "2cc6ac9672419c0320a78f071334d6fe14ed03fc3d5fa87d822d9251e0c06b2b",
  },
  {
    path: "apps/web/agreements/static-fonts/Manrope-Regular.ttf",
    sha256: "4335f883346d9f2c203021edac8152f61ebc8b224f9f567e655f6e3583bcb201",
  },
  {
    path: "apps/web/public/agreements/guest.pdf",
    sha256: "a560ee259a9f42141628dd221ff2b1d13e418c502f81e279521ac449f00613bd",
  },
  {
    path: "apps/web/public/agreements/member.pdf",
    sha256: "a9a71749aa2db0ffff8b0f8f9ccf9400d29e3d53d4902dcb9f6b1e3c648d28f2",
  },
  {
    path: "apps/web/public/apple-touch-icon-180x180.png",
    sha256: "6c500e42ea18cb27fb8ca3d5369df12f419acf16730f0118f66fd19022c1b733",
  },
  {
    path: "apps/web/public/email/logo.png",
    sha256: "e358fd754e6e6544e30e87bde902e733b11e35e949af56edb4ab68bcd79df488",
  },
  {
    path: "apps/web/public/maskable-icon-512x512.png",
    sha256: "88b737688b659710880a97388c03ad12ddaf8036476d718a3c02e02ab3de55b4",
  },
  {
    path: "apps/web/public/pwa-192x192.png",
    sha256: "8f81ef1fbe15938526faed675af3427f6b0f29776a223ae4504ab38a27235baf",
  },
  {
    path: "apps/web/public/pwa-512x512.png",
    sha256: "7cb70eee2d9c817da30e78fb29e3d84f6598ce835bdbcad78af801d1bae8214b",
  },
  {
    path: "apps/web/public/pwa-64x64.png",
    sha256: "c906828bc87520f7d466a7c13cb0a6c469b64f4f2fabe0136806ca44ab1ab637",
  },
  {
    path: "apps/web/src/modules/inventory/print/letterhead.pdf",
    sha256: "9e48b59067f5e89ad1445431a640435ff232ac29439dd4f8da66a1c4428c59b1",
  },
];

export const IGNORE_PATHS: readonly string[] = ["bun.lock", "**/_generated/**"];
