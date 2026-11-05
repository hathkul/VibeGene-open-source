# VibeGene Cloudflare services

VibeGene uses two separately deployed Workers and one D1 database:

- `telemetry-api` is the public, rate-limited ingestion API at `api.vibe-gene.com`.
- `telemetry-admin` is the admin UI/API at `admin.vibe-gene.com`. It fails closed unless Cloudflare Access supplies an allowed identity.
- `vibegene-telemetry` stores hashed installation identifiers. Client IP addresses are used only as ephemeral rate-limit keys and are never written to D1.

Raw heartbeat events are retained for 90 days. Resolved bug reports are retained for 180 days; open reports remain until resolved. Inactive install summaries are removed after one year.

The Turnstile secret is stored as the public Worker's `TURNSTILE_SECRET` secret and is never committed. Browser bug reports require a single-use Turnstile token. The standalone Tauri app cannot use a production-hostname Turnstile challenge, so its reports use both edge rate limiting and a persistent per-install daily limit.
