# J Floor TV (Tizen)

A Samsung TV app that shows the J Floor slideshow. The TV shows a QR code; a signed-in board member scans it and confirms, and the TV starts playing.

## Build

Both variables are required for a release build (`bun run build:release`, used by `scripts/package.sh`); it fails without them. The plain `bun run build` is a compile check for CI that uses example.com placeholders and must never be packaged.

```sh
export VITE_TV_API_URL=<convex-site-url>   # the Convex HTTP site URL
export VITE_TV_APP_URL=<web-app-origin>    # used in the pairing QR code
bun run --filter @j-os/tv build:release
```

The output is `apps/tv/dist` (it includes `config.xml`).

## Package and install

Needs [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html) (its `tizen` and `sdb` CLIs on your `PATH`) and a Samsung certificate profile.

1. On the TV, enable Developer Mode (Apps panel, type 12345, switch Developer mode on and enter your computer's IP). Restart the TV.
2. Connect: `sdb connect <tv-ip>`, then `sdb devices` to get the `<target>` name.
3. Package: `TIZEN_PROFILE=<profile> apps/tv/scripts/package.sh` (builds, then runs `tizen package -t wgt -s <profile> -- dist`). This writes a `.wgt` file into `dist`.
4. Install: `tizen install -n JFloorTv.wgt -t <target> -- apps/tv/dist`, then launch the app from the TV's app list.

Check the values in `config.xml` against the actual TV before packaging: the Tizen version (`required_version`) and the privilege names. Find the version on the TV under Settings, Support, About TV, and compare with Samsung's current Tizen docs. The `id` and `package` are placeholders.

## Try it

1. The TV shows a QR code and a 4-character check code.
2. Scan with a signed-in board phone: it opens `/tv/pair` and shows the same check code.
3. Confirm: the TV starts the slideshow within a few seconds.
4. Remove the TV in the web app: it returns to the QR screen within a minute.
5. In Space, TV, upload a pack (a zip with `config.xml`, `slides/`, `assets/`): within about a minute the TV plays it.
6. Edit `config.xml` there (change a duration): the TV follows within about a minute.
7. Check one HTML slide that uses a font and an image from `assets/`: both must show on the TV (Chrome 76 sandboxed frame). That a `data:` URI loads in the sandboxed `srcdoc` frame while a `blob:` URL does not was observed only in headless Chromium 152; it is NOT verified on Chrome 76 or a real TV. If it fails there, HTML slides show without their fonts and images.
8. Memory, worst case (NOT measured; do this before relying on large packs): upload a pack at the server's limits (a zip near 40 MiB, several 8 MiB assets, HTML slides that each use them), watch the TV through a swap to a second such pack and leave it playing for an hour. It must not crash, reload or freeze.

## Memory on the TV

Not measured on a real TV. What the code holds, from reading it:

- During a download the whole zip (up to about 40 MiB) is in memory. It is dropped before the new pack replaces the old one.
- Entries are inflated one at a time. An asset is turned into a data: URI once per load and reused by every slide that uses it, but each HTML slide's final string still contains its own copy (base64 is 4/3 of the file). Peak while building: the zip, the config, one inflated asset (up to 8 MiB), its base64 pieces and the cached data: URIs of every asset used so far.
- Resident, per pack: every HTML slide string (with its data: URIs) plus every image slide's bytes as a blob.
- A pack whose HTML slides together exceed 96 MiB of characters is refused as broken (last good pack stays, backoff as below). The limit is a guess from reading the code, not a measurement: the true safe size on the TV is still unknown.
- An image slide whose path and bytes are unchanged keeps its blob: URL across a pack swap (no redraw); a changed one gets a new URL.
- During a swap the old pack (strings and blobs) stays until the new one is built, so the peak is roughly both packs resident plus the build transient above. The 64 MiB inflate cap bounds one load, not the resident total.
- Every request has a timeout (30 seconds; 5 minutes for the pack) so a stalled connection cannot freeze syncing; a timeout counts as a network error.
- A pack that fails to download, build or play (network error, 5xx, timeout, broken zip, a throw from the player) is not downloaded again for 5 minutes, then 10, up to an hour (reset by a new version or a success), and the last good pack keeps playing.

If a TV loses the pairing response (power cut or network drop right after the phone confirms), the server may already have created a device the TV never received. It shows as an unused TV in Space, TV: the board should revoke it there.

None of this is covered by automated tests on a real TV; unit tests cover the pairing and sync logic only.
