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

If a TV loses the pairing response (power cut or network drop right after the phone confirms), the server may already have created a device the TV never received. It shows as an unused TV in Space, TV: the board should revoke it there.

None of this is covered by automated tests on a real TV; unit tests cover the pairing and sync logic only.
