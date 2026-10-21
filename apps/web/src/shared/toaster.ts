import { createToaster } from "@j-os/design-system";

/** For a failure with no area of its own to show it in. Mounted once, in `index.tsx`. */
export const toaster = createToaster({ placement: "bottom-end" });
