# Arena God Tracker

A static page for tracking progress toward **Arena God** — winning an Arena game on 60 different
champions. You mark wins yourself; there is no Riot API integration and nothing is sent anywhere.

Roster is current as of **Data Dragon 16.17.1** — 173 champions, newest being Locke.

## Deploy to GitHub Pages

1. Create a repository and copy these files into its root.
2. Push to `main`.
3. Repository → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `(root)`.
4. The site is live at `https://<user>.github.io/<repo>/` within a minute or so.

No build step, no bundler, no dependencies at runtime. To try it locally, any static server works:

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

Opening `index.html` directly from the filesystem also works.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure |
| `styles.css` | All styling |
| `app.js` | Toggling, filtering, progress, save/restore |
| `champions.js` | Vendored champion roster (id, display name, class tags) |
| `tools/update-champions.mjs` | Regenerates `champions.js` from Data Dragon |
| `tools/test.mjs` | Behaviour tests (needs `npm install jsdom`) |

## Keeping the roster current

Champion data is vendored into `champions.js` at build time, so a Data Dragon outage can't break the
deployed page. After a patch that adds or reworks champions:

```bash
node tools/update-champions.mjs     # Node 18+
```

It fetches the latest Data Dragon version, rewrites `champions.js`, and warns if Riot introduces a
class tag the filter chips don't cover yet. Commit the result.

### Icons

Champion icons load from Data Dragon's CDN at runtime. If an icon fails to load, the tile falls back
to the champion's initial, so a CDN outage degrades gracefully rather than breaking the grid.

To remove that dependency completely:

```bash
node tools/update-champions.mjs --icons        # downloads 173 PNGs into icons/
```

Then change `ICON_BASE` near the top of `app.js` to `'./icons/'`.

Fonts (Cinzel, Barlow) load from Google Fonts and fall back to system serif/sans stacks offline.
Self-host them the same way if you want zero third-party requests.

## How it works

**Progress.** The bar is 60 notches, one per required win. Marked champions light notches left to
right; hitting 60 lights the full rail once and shows a completion line. The achievement needs 60
unique champions but there are 173 in the game, so the counter caps at 60 while you can still mark
every champion — anything past 60 is reported separately ("10 past the goal").

**Filtering.** Search, class, and won/remaining all compose. Class chips are additive: picking
Tank and Mage shows champions in either class. Search ignores punctuation and case, so `kaisa`
finds Kai'Sa, `drmundo` finds Dr. Mundo, and `wukong` finds him even though his internal id is
`MonkeyKing`.

**Storage.** Progress is saved to `localStorage` under `arenaGod.progress.v1` on every change, and
syncs across open tabs. If storage is blocked (private browsing, hardened settings) the app keeps
working in memory and tells you saving failed rather than silently losing data.

**Backups.** *Export progress* downloads `arena-god-progress.json`:

```json
{
  "app": "arena-god-tracker",
  "version": 1,
  "patch": "16.17.1",
  "savedAt": "2026-09-02T10:00:00.000Z",
  "champions": ["Ashe", "Jinx", "Sett"]
}
```

*Import progress* accepts that file or a bare array of champion ids. Unrecognised ids are skipped and
reported instead of corrupting the count.

## Tests

```bash
npm install jsdom
node tools/test.mjs
```

73 assertions covering rendering, toggling, search, class filters, the won/remaining toggle, filter
composition, persistence across reloads, the 60 cap, export, import (including malformed files),
reset, corrupt saved state, and blocked storage. The suite fails on any console error.

## Accessibility

Tiles are real buttons with `aria-pressed`; the rail is a `progressbar` with live values; filter
state changes announce through a polite live region; focus is always visible; `prefers-reduced-motion`
disables the completion animation.

## Legal

Arena God Tracker is not endorsed by Riot Games and does not reflect the views or opinions of Riot
Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and
all associated properties are trademarks or registered trademarks of Riot Games, Inc.
