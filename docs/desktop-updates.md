# Desktop update releases

The updater is disabled unless `VIBEGENE_UPDATER_PUBLIC_KEY` is set when the
desktop executable is compiled. Never embed a test key in a production build.
The corresponding private key must be stored securely outside the repository;
losing it prevents already-installed clients from accepting future updates.
Tauri verifies each artifact and requires its signature to bind the advertised
version. Update checks do not depend on telemetry.

## Building updater artifacts

Use Tauri CLI 2.12 or newer. Set `VIBEGENE_UPDATER_PUBLIC_KEY` to the contents
of the public key file and `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to the signing credentials in the secure
build environment. Build with `--config src-tauri/tauri.updater.conf.json`.
The bundler also reads `plugins.updater.pubkey` from the Tauri configuration:
the compile-time environment variable alone does not configure its signing
step. Supply the public key in an additional merged config, or build the
artifact without automatic signing and sign it explicitly with
`tauri signer sign --app-version VERSION`. Never put the private key or its
password in the config or repository.
On Windows set `VIBEGENE_UPDATER_INSTALL_MODE=installer` only for the NSIS
installer build; never set it for a portable executable. Linux AppImages can
self-update; Debian packages and portable Windows builds offer a download link.
The Linux release workflow has an opt-in `signed_updater` input that uses the
corresponding GitHub Actions secrets and supplies the public key to the bundler
through a temporary merged configuration. Signing and publishing are not enabled
by default.

For each architecture, publish the updater artifact and its `.sig` first.
macOS requires the `.app.tar.gz`, not the DMG; Windows uses its NSIS installer;
Linux uses the AppImage. Run:

```
npx tsx scripts/update-manifest.ts VERSION PLATFORM HTTPS_ARTIFACT_URL SIGNATURE_FILE OUTPUT_JSON [NOTES_FILE]
```

The signature must include the same signed version. The script refuses to
overwrite an existing output file; this helps avoid publishing an incomplete
manifest accidentally. It checks metadata, not the cryptographic signature;
Tauri verifies the signature during download. After independently verifying
the artifact and signature, publish the JSON last at the matching URL:

- `https://vibe-gene.com/updates/darwin-aarch64.json`
- `https://vibe-gene.com/updates/darwin-x86_64.json`
- `https://vibe-gene.com/updates/windows-x86_64.json`
- `https://vibe-gene.com/updates/linux-x86_64.json`
- `https://vibe-gene.com/updates/linux-aarch64.json`

Separate manifests allow the platforms to ship on different dates. A private
GitHub release URL cannot be downloaded by the general public; use publicly
accessible artifact hosting. The manifest's version and artifact must belong
to the same release. Do not publish or replace a production manifest until its
artifact has been independently tested on the target platform.

Production update files are served by the `vibegene-updates` Cloudflare Worker
on the `/updates/*` route, separately from the website's Pages deployment. Its
configuration is in `deployment/updater/wrangler.jsonc`; stage the complete
public asset tree under the ignored `deployment/updater/assets/` directory
before deploying. A Worker deployment replaces the previous asset snapshot,
so retain existing platform manifests and their referenced artifacts when
publishing another platform or version. Cloudflare limits individual static
assets to 25 MiB. Store larger AppImages as numbered parts below that limit,
with a `.parts.json` descriptor containing their byte `size` and number of
`parts`; the Worker streams the original AppImage without changing its signed
bytes. Verify the downloaded file's hash and signature before publishing its
manifest.

The first updater-enabled version must be installed manually. macOS code
signing and notarization, and Windows code signing, are separate from Tauri's
updater signature and should be handled for public distribution.
