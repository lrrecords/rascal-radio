# Rascal Radio

Self-hosted playlist pages for **Rascal Radio** by Little Rascal Records — a replacement for Indiecrates crates.

- Static HTML/CSS/vanilla JS on **Cloudflare Pages** (no framework, no build step)
- API in **Pages Functions** (`/functions`), data in **Cloudflare D1** (`rascal_radio`)
- `/admin` locked by **Cloudflare Access** (free tier) — no login code in the app
- Music plays only through the **official Bandcamp embedded player** and the **YouTube IFrame player**. Audio is never extracted or proxied.

## What's where

| Path | What it is |
|---|---|
| `/` | Published shows, newest first |
| `/s/:slug` | Public crate page: cover collage, title, air date, Blast Radio + podcast buttons, track list, Play / Shuffle / Share, sticky player |
| `/embed/:slug?size=compact` | 152px-tall iframe player (`?size=full` = tracklist + player, ~480px) |
| `/admin` | Create/edit shows, paste links, drag to reorder, segment notes, publish |
| `/admin/import` | Paste a public Indiecrates crate URL → draft show in the same order |
| `POST /api/resolve` | `{url}` → `{title, artist, album, duration_s, art_url, source, embed_id, play_url}` |
| `GET /api/shows`, `GET /api/shows/:slug` | Public read API (published shows only) |
| `/api/admin/*` | CRUD for shows, tracks, show_tracks + crate import (behind Access) |

```
public/            static site (Pages output dir)
functions/         Pages Functions (API + /s and /embed page handlers)
lib/               shared server code (resolver, D1 queries, Access check)
migrations/        D1 schema
scripts/           test-api.mjs, seed-test.mjs
test/              offline parser tests + embed-test.html
```

## How the player works

- The sticky player plays the show's queue in order and swaps between the Bandcamp embed and the YouTube player per track.
- **YouTube** reports when a video ends, so the queue moves on by itself.
- **Bandcamp's embed doesn't report when a track ends** (and a cross-origin iframe can't be watched), so for Bandcamp tracks the **Next ⏭** button is highlighted and the player says so. The visitor also presses ▶ inside the Bandcamp player, because Bandcamp doesn't allow autoplay.
- YouTube requires its player to be at least 200×200px, so it shows as a small floating video above the bar. The **compact** embed (152px tall) is too small for that, so YouTube tracks there show a "watch on YouTube" link (and a link to the full player). Bandcamp tracks play inline in both embed sizes.
- Album links resolve to **one track** of the album (track 1, or the track whose title matches a hint; the import sends the Indiecrates row title as that hint). Bandcamp's embed for `album=…/track=…` starts on that track.
- YouTube oEmbed has no duration, so YouTube tracks start with a blank time. The player fills it in while playing, or you can type it in `/admin` (m:ss).

## Local development

Needs Node 18+.

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` sets `DEV_ONLY_SKIP_ACCESS_CHECK=1`, which skips the Access check **only for requests to localhost/127.0.0.1**. It's gitignored, and nothing in production uses it.

```bash
npx wrangler d1 migrations apply rascal_radio --local
```

```bash
npm run dev
```

The app runs on http://127.0.0.1:8788. In a second terminal:

```bash
npm test
```

```bash
npm run test:api
```

```bash
npm run seed:test
```

- `npm test`: offline parser tests (Bandcamp, YouTube, Indiecrates).
- `npm run test:api`: resolves a Bandcamp album URL, a Bandcamp track URL and YouTube URLs live, then runs a show/tracks CRUD round-trip.
- `npm run seed:test`: creates a published 5-track show at http://127.0.0.1:8788/s/test (4 Bandcamp + 1 YouTube).

To check the embed on a plain page, serve `test/` on another port:

```bash
python3 -m http.server 8790 -d test
```

Then open http://127.0.0.1:8790/embed-test.html.

## Deploy: Cloudflare Pages + D1

1. **Create the D1 database** (once):
   ```bash
   npx wrangler login
   ```
   ```bash
   npx wrangler d1 create rascal_radio
   ```
   Copy the printed `database_id` into `wrangler.toml` (replacing the zeros) and commit it. It's an identifier, not a secret.
2. **Apply the schema to the real database:**
   ```bash
   npx wrangler d1 migrations apply rascal_radio --remote
   ```
3. **Create the Pages project:** Cloudflare dashboard → *Workers & Pages* → *Create* → *Pages* → *Connect to Git* → pick `lrrecords/rascal-radio`.
   - Production branch: `main`
   - Framework preset: *None*. Build command: *(leave empty)*. Build output directory: `public`
   - The D1 binding (`DB`) and vars come from `wrangler.toml`, so there's nothing to add under Settings → Bindings.
4. Every push to `main` deploys to production. Other branches get preview URLs (`<branch>.rascal-radio.pages.dev`).

## Lock down admin: Cloudflare Access policy

Access does the login (one-time PIN to your email, free for up to 50 users). The app also checks Access's signed token on every `/admin` and `/api/admin` request and **refuses everything until it's configured** (fail closed).

1. Cloudflare dashboard → **Zero Trust** → set up a team name if you haven't (e.g. `lrrecords` → team domain `lrrecords.cloudflareaccess.com`).
2. **Access → Applications → Add an application → Self-hosted.**
   - Application name: `Rascal Radio admin`
   - Add these public hostnames/paths (one row each):
     - `rascalradio.lrrecords.com.au` path `admin`
     - `rascalradio.lrrecords.com.au` path `api/admin`
     - `rascal-radio.pages.dev` path `admin`
     - `rascal-radio.pages.dev` path `api/admin`
     - optional, for previews: `*.rascal-radio.pages.dev` with the same two paths
   - A path of `admin` covers `/admin` and everything under it (`/admin/import`), and `api/admin` covers all admin API routes.
3. **Policy:** Action *Allow* → Include → *Emails* → your email address (add anyone else who should edit shows). Login method: *One-time PIN*.
4. Save, then open the application's **Overview** and copy the **Application Audience (AUD) Tag**.
5. In `wrangler.toml` set:
   ```toml
   ACCESS_TEAM_DOMAIN = "lrrecords.cloudflareaccess.com"   # your team domain
   ACCESS_AUD = "<the AUD tag>"
   ```
   Commit and push. Neither value is a secret.
6. Check it: open `/admin` in a private window. You should get the Access login, and after the PIN, the editor.

`/api/resolve` stays public (the admin page calls it), but it only fetches `*.bandcamp.com` and YouTube URLs.

## Custom domain: rascalradio.lrrecords.com.au

`lrrecords.com.au` DNS is already on Cloudflare, so:

1. Pages project → **Custom domains** → **Set up a custom domain** → `rascalradio.lrrecords.com.au`.
2. Cloudflare adds the `CNAME rascalradio → rascal-radio.pages.dev` record for you (proxied). Wait for the status to show *Active* (usually a few minutes; SSL is automatic).
3. Make sure the Access application includes this hostname (step 2 above).

## Embedding on the EasyFunnels page

Paste this into an EasyFunnels **Custom HTML / Code** element and change `SHOW-SLUG` to the show's slug (the part after `/s/`):

```html
<iframe src="https://rascalradio.lrrecords.com.au/embed/SHOW-SLUG?size=compact"
        width="100%" height="152" style="border:0;border-radius:12px;max-width:100%"
        loading="lazy" allow="autoplay; encrypted-media; clipboard-write"
        title="Rascal Radio playlist"></iframe>
```

For the larger player with the full tracklist, use `?size=full` and `height="480"`. Every show page also has **Share → Copy embed code**, which gives you the exact snippet.

The embed only allows framing from `lrrecords.com.au` and its subdomains (`Content-Security-Policy: frame-ancestors`). The EasyFunnels editor preview may run on another domain and show a "refused to connect" box. The live page on lrrecords.com.au is fine. If EasyFunnels serves the live page from a different domain, add that domain to the list in `functions/embed/[slug].js`.

## Data model (phase 1)

- `shows(id, slug UNIQUE, title, episode_no, air_date, blast_url, podcast_url, notes, status draft|published, created_at)`
- `tracks(id, title, artist, album, duration_s, art_url, source bandcamp|youtube, play_url, embed_id, created_at)`. `embed_id` is `track=123` / `album=123/track=456` for Bandcamp, or the 11-character video id for YouTube.
- `show_tracks(show_id, track_id, position, segment_note)`

New schema changes go in a new numbered file in `migrations/`, applied with `npm run db:migrate:local` and `npm run db:migrate:remote`.

## Notes

- No personal data is stored: no accounts, emails or analytics. YouTube plays via `youtube-nocookie.com`.
- If Bandcamp ever starts blocking Cloudflare's servers from fetching its pages, `/api/resolve` will return a clear error. Add those tracks by hand through the track API, or try again later.
- Phase 2 (Spotify) and phase 3 (listener features) are out of scope here.
