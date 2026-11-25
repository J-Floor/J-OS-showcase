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

export const ALLOWED_MAC_PREFIXES: readonly string[] = [
  "00:00:5e:00:53",
  "02:00:5e:00:53",
  "01:00:5e:90:10",
];

export const BINARIES: readonly { path: string; sha256: string }[] = [
  {
    path: "packages/design-system/src/styles/material-symbols-sharp-subset.woff2",
    sha256: "1b88c339cf96c61435e0e31bfae76b03aee6471889c0919322a138db0e150257",
  },
  {
    path: "apps/tv/public/icon.png",
    sha256: "de9adf75d1a4a529c489efbad4c898c8d92073ccaf0c8feaaaae8bd3471bad09",
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
  {
    path: "apps/website/public/assets/community/community.webp",
    sha256: "ede49a23cdf29268b467167d4ee7150a45627b800b29d7115e5081a6e38a0ebf",
  },
  {
    path: "apps/website/public/assets/community/lounge.webp",
    sha256: "bba2226b75b56c2aaa97c3910280c387e27ca62d8c12b9d0e8f9c03937c1ab4a",
  },
  {
    path: "apps/website/public/assets/community/workspace.webp",
    sha256: "e9c4925c1863f3c057c492d2743b36f4db61ef72ee892537b8704fda07aee526",
  },
  {
    path: "apps/website/public/assets/fonts/azeret-mono.woff2",
    sha256: "d090ca8b9080094d42b06c43f2987bfa8b36fd5565611fd59db84db53c5f74bb",
  },
  {
    path: "apps/website/public/assets/fonts/manrope.woff2",
    sha256: "a30ddcd349703aff7464c34bef3fffdff405ee50c113440d7c8693c02d210972",
  },
  {
    path: "apps/website/public/assets/hero/background.mp4",
    sha256: "afcdaa1939c33bf4bc5429d059036a438471845e9049159964f503d1ff3a1fc3",
  },
  {
    path: "apps/website/public/assets/hero/poster.webp",
    sha256: "79a8e668b40d06c0785937a77132bba21255789a747e993047272c9fbd5cb319",
  },
  {
    path: "apps/website/public/assets/logos/arc-investors.webp",
    sha256: "7c24e8d6d364549dd0a81807c20090c211f1efaa81f09303692893488e151a38",
  },
  {
    path: "apps/website/public/assets/logos/earthling-vc.webp",
    sha256: "5d297ecd301cf8a0ae68145e2cca9e58cffd75655f8cc17afc95e814eae1cce3",
  },
  {
    path: "apps/website/public/assets/logos/nemu-and-co.webp",
    sha256: "350b2ef81fd9ca8cab5e3eecf8fc4dcb58a9882cf021a833aede9e5b61ac2e24",
  },
  {
    path: "apps/website/public/assets/logos/project-a.webp",
    sha256: "923df9c109a2d052db7329d88829b65e9f030b1f170cc3365e608a6d4c32ea7e",
  },
  {
    path: "apps/website/public/assets/logos/swisscom.webp",
    sha256: "5d5b310a1a8750b6302c5ca2e78a81ddbeaea45bfe0a5ba1d99651398d23dbdd",
  },
  {
    path: "apps/website/public/assets/partners/ai-tinkerers-white.png",
    sha256: "a35f0a572dc4733ea44d10ec99cda3e530138d7b0e54d339a165273fdd582ed8",
  },
  {
    path: "apps/website/public/assets/partners/ai4science-club-zurich-white.png",
    sha256: "f8f5282b4fede8a8d8bb5c96da4fa91c1325a0cab603f159adfaa6b609ece646",
  },
  {
    path: "apps/website/public/assets/partners/baby-vc-white.png",
    sha256: "b25909a4156ad59f790b1578b71081cfe20b6fc3fd4d66b8500b9d63064fbdda",
  },
  {
    path: "apps/website/public/assets/partners/berkeley-skydeck-white.png",
    sha256: "d41662186ae8b60cc3bd297f4ed1ac7f20a0739f5feaf1094dee3b056823e319",
  },
  {
    path: "apps/website/public/assets/partners/browser-use-white.png",
    sha256: "0c0a7b77eb759fac3bd8eae9542a2a7c13de00edd8c808a9448e16300fc6db1a",
  },
  {
    path: "apps/website/public/assets/partners/dukers-white.png",
    sha256: "a8f322e724372f4cf019fcd3d0aa593407c9b6b8c732aca08d1a4fd42bc1fb36",
  },
  {
    path: "apps/website/public/assets/partners/esra-white.png",
    sha256: "311b75bfdc2eaf209ea7a135f1d91dfa4351c445f84896d3c6d0eac714dd76ef",
  },
  {
    path: "apps/website/public/assets/partners/eth-ai-club-white-white.png",
    sha256: "edf783617794f720aa7890c7398e51c2f446bb04d199a915cf19ea13bdc61885",
  },
  {
    path: "apps/website/public/assets/partners/eurotube-foundation-white-white.png",
    sha256: "0562f891edc63c4d35460804c25253c6109973d46eb913e7fb39a60ef96ec6bd",
  },
  {
    path: "apps/website/public/assets/partners/hack-nation-white.png",
    sha256: "d120cb2438972fdfee0e72cbcc237adc47cbca40373214cab5fa6b2b114c5181",
  },
  {
    path: "apps/website/public/assets/partners/hits-white-white.png",
    sha256: "d92ceedb99f1a6eb7d05c279138b33cbf453e5f49e149cbea2d9cf21f78a7bb0",
  },
  {
    path: "apps/website/public/assets/partners/lutes-white-white.png",
    sha256: "8f2481239a14b84150ddd3c571c93cfc5223c7d42b189a8ff6b332e6d57d341e",
  },
  {
    path: "apps/website/public/assets/partners/swisscom-ventures-white.png",
    sha256: "5018ce2bb2a9ebe0c37a66b2bc538486a8dc8913dc5922a7a77a268907bec4e4",
  },
];

export const IGNORE_PATHS: readonly string[] = ["bun.lock", "**/_generated/**"];
