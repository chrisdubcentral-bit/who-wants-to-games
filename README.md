# Who Wants To Games

A set of themed "Who Wants To Win…" quiz games that all run on one shared game engine, each with its own
question review system. Every edition has its own wording, stages, categories, questions, colours and images,
while the gameplay, admin tools and storage come from the engine. A fix to the engine reaches every edition.
Plain HTML, CSS and JavaScript. No frameworks, no build step.

## Editions

| Edition | Folder | Theme |
|---|---|---|
| Who Wants To Win The European Cup — Celtic Edition | `editions/celtic/` | Celtic football quiz in the "Celtic European Nights" style |

To add another, see [Starting a new edition](#starting-a-new-edition).

## Running it

The pages load their questions from JSON files, and browsers block that when a page is opened
by double-clicking. Run it from a local web server instead:

1. Open this folder in VS Code.
2. Install the **Live Server** extension (by Ritwick Dey) if you don't have it.
3. Right-click the `index.html` in the project root and choose **Open with Live Server**. It lists the editions.

| Page | What it is |
|---|---|
| `index.html` | List of editions (development only) |
| `editions/<name>/index.html` | An edition's game, e.g. `editions/celtic/index.html` |
| `editions/<name>/admin-review.html` | An edition's question review (approve, reject, edit, import, publish) and its Adverts tab |
| `tests/test-runner.html` | Unit tests for the game rules, validation and picker |

Live Server has no online Top 100 behind it, so the Top 100 shows "Couldn't reach the Top 100" there. To try it
locally, run `npm install` once and then `npm run dev`, and open `http://localhost:8888`. That serves the same
files plus a working Top 100 kept in memory (empty each time it starts). See [Online Top 100](#online-top-100).

## Playing on a phone

The game is one responsive page: on a phone the answers stack in a single column, the tournament
ladder is hidden so the question has the room (the stage name still shows above it) and the 50:50 button stays
within reach at the bottom of the screen. Each edition's `manifest.webmanifest` and the icons in its `assets/img/` let
it be added to a phone's home screen as an app. The examples below use the Celtic edition; swap in another edition's folder as needed.

### Testing in a desktop browser

In Chrome or Edge press `F12`, then `Ctrl+Shift+M` to toggle the device toolbar and pick a phone such
as "iPhone 14" or "Pixel 7". Refresh after switching so the layout and fonts settle.

### Testing on your phone

1. Make sure the phone and the PC are on the same Wi-Fi.
2. In `.vscode/settings.json`, change `"liveServer.settings.host"` to `"0.0.0.0"` and `"liveServer.settings.useLocalIp"` to `true`,
   then stop and restart Live Server. Change them back to `"127.0.0.1"` and `false` when you finish, because the admin
   page can only save straight into the question folder on 127.0.0.1.
3. Find the PC's address: run `ipconfig` in a terminal and look for **IPv4 Address** under your Wi-Fi adapter
   (e.g. `192.168.1.72`).
4. On the phone open `http://<that address>:5500/editions/celtic/index.html`.
5. If it doesn't load, Windows Firewall is probably blocking it. The first time Live Server starts you may
   get a prompt asking to allow it on private networks; otherwise allow **Node.js** or **Code** through the
   firewall for private networks.

The phone and the PC each keep their own statistics, because those are stored in the browser.

### Adding it to the home screen

- **Android (Chrome):** menu (⋮) → **Add to Home screen**.
- **iPhone (Safari):** Share → **Add to Home Screen**.

Over plain `http://` on your home network this makes a shortcut that opens full-screen. Installing it as a
proper app that works offline needs the game hosted over `https://`, for example on GitHub Pages or Netlify.

## Sharing a test link

Testers play a hosted copy on Netlify (free plan), built from the GitHub repo's **`live`** branch. Day-to-day work
goes to `main` and testers don't see it until it's copied to `live`.

`tools/build.js` makes the hosted copy in `dist/`: the game, the approved questions and the advert videos. The
question review page, pending and rejected questions, import batches and tests are left out. `netlify.toml` tells
Netlify to run it, so you never need to run it yourself (`node tools/build.js` still works locally to check the output).

### Setting it up (once)

1. In Netlify choose **Add new site → Import an existing project → GitHub**, allow access to the
   `who-wants-to-games` repository and pick it.
2. Set **Branch to deploy** to `live`. Leave the build command and publish directory as they are; Netlify reads them
   from `netlify.toml`. Then deploy.
3. You get a link like `https://something.netlify.app` to send to testers. You can rename it in the site's settings.

### Updating what testers see

Publish any question changes and push your work to `main`, then copy `main` to `live`:

```
git push origin main:live
```

Netlify rebuilds the site a minute or two later. The link stays the same.

Each tester's statistics stay on their own device; the Top 100 is shared by everyone. Because the link is `https://`, adding it to a phone's
home screen installs it as a proper app. The build asks search engines not to list the site, but anyone with the link
can play, and the approved questions and answers can be read from the page's files, as with any browser game.

## Online Top 100

One Top 100 per edition, shared by every player. It runs on the same Netlify site:

- `netlify/functions/top100.mjs`: the API the game calls (`/api/top100`). The logic is in `server/top100/`.
- `netlify/database/migrations/`: the database tables. Netlify Database creates the database and applies these on
  deploy. Never edit one that has been deployed; add a new numbered file.
- `moderation/banned-words.json`: the word filter (see below).
- `admin/top100.html`: moderation page, published at `https://<your site>/admin/top100.html`.

### Setting it up (once)

1. In Netlify open the site, go to **Data & Storage → Database** and create the database (or just deploy: Netlify
   creates it when it sees `netlify/database/migrations`). Netlify sets `NETLIFY_DB_URL` for you.
2. In **Site configuration → Environment variables**, add:
   - `TOP100_ADMIN_KEY`: the password for the admin page. Make it long and random.
   - `TOP100_IP_SALT`: any random text. It makes the stored IP hashes impossible to reverse.
3. Deploy (`git push origin main:live`). The first deploy applies the migration and creates the tables.

### How it stops cheating and abuse

- **Run tokens:** when a game starts, the game asks the server for a token, and the server notes the time. An entry
  needs a token, and the run must have lasted at least 3 seconds per question answered. A game started without a
  connection can't be entered (the player is told why).
- **Plausible results only:** the server checks that the cups, rounds won, stage reached, rounds played and time all fit
  the edition's tournament, and works out the stage name itself.
- **Rate limits:** 120 new games an hour per connection, and 20 updates per run. IP addresses are only stored as a
  salted hash.
- **Limits of this:** the game runs in the browser, so someone determined could still script a perfect run in a
  believable time. Stopping that would need the server to deal and mark every question.

### Word filter

`moderation/banned-words.json` lists words and phrases that can't be used in a name or town. Its `_help` section explains
the lists: `words` (whole words only, so "Scunthorpe" is fine), `anywhere` (blocked inside other words too), and
extra lists per edition under `editions` (rival clubs and sectarian terms for Celtic). The checker ignores capitals and
accents and sees through tricks like `f.u.c.k`, `fuuuck`, `sh1t` and look-alike letters. Links, emoji and symbols
are refused too.

The board is re-checked every time it loads, so after adding a word and deploying, any existing entry that uses it
disappears straight away. It stays in the database and the admin page shows it as **Blocked**.

### Admin page

Open `/admin/top100.html` on the site and enter `TOP100_ADMIN_KEY`. It lists every entry. **Hide** takes one off the
board (and **Show** puts it back). Entries caught by the word list are marked **Blocked**.

### Starting a fresh board

Change `BOARD` at the top of `server/top100/handlers.js` (e.g. to `"2027"`) and deploy. The old entries stay in the
database under the old name.

### Tests

`npm run test:server` runs the server tests: the word filter, result checks (using games played through the real
engine) and the API with an in-memory store.

## Sharing scores

Players on the Top 100 get a **Share Your Score** button (on the Top 100 page and on the results screen). It shares a
message like "I'm number 12 in the Top 100 on Who Wants To Win The European Cup (Celtic Edition)… Can you beat me?"
with a link to the game, plus a scorecard picture drawn in the browser (name, town, position, cups, round, 50:50).

- **Phones and tablets:** opens the phone's own share menu (WhatsApp, Instagram, Facebook, Messages…), with the picture.
- **Computers:** a panel with WhatsApp, X, Facebook, Copy Message and Save Image.
- The wording is in `text.share` in the edition's `data/edition.json`; the code is `engine/js/game/share.js`.
- Shared links end in `?utm_source=shared-score`, so the dashboard counts the visits they bring as **Shared scores**,
  and the **Shared scores** panel shows how many players shared and how.

**Link previews:** the game page has preview tags, so links to it show a card with
`editions/celtic/assets/img/share-preview.png` (1200 × 630) on Facebook, WhatsApp, X and iMessage. The build makes the
picture's address absolute using the site address Netlify supplies (`URL`; set `SITE_URL` to override, e.g. once you
have your own domain). Facebook keeps previews for a while: after changing the picture, paste the link into
https://developers.facebook.com/tools/debug/ and press **Scrape Again**.

## Site statistics

A dashboard of anonymous visit figures, at `https://<your site>/admin/stats.html` (same admin key as the Top 100 page;
locally `npm run dev` then `http://localhost:8888/admin/stats.html`, key `dev`). Pick 7 days, 30 days, 90 days,
12 months or your own dates. It shows:

- visits, visitors, average and typical time on site, and how many leave within 10 seconds without playing;
- visits per day (hover for visitors and games; **Show as table** for the numbers);
- **adverts**: views, clicks (and whether the video or the button was tapped), click rate, skips and how long people
  watched before skipping, and how many watched to the end;
- how far players get in their first season, stage by stage;
- where visitors come from, time-on-site bands, phone / desktop / tablet, countries and regions.

**Telling your posts apart:** add `?utm_source=` to links you share, e.g.
`https://<your site>/?utm_source=facebook-group` or `?utm_source=newsletter`. Each shows as its own source. Shares on
WhatsApp and in apps usually arrive with no referrer, so they show as Direct unless tagged.

**Leaving yourself out:** open the game once on each of your devices with `?notrack` on the end of the address. That
device is no longer counted (open it with `?track` to undo).

**Privacy:** no cookies, nothing saved on the player's device for tracking, and no IP addresses stored. Each visit gets
a random id that only exists while the page is open. Unique visitors are counted with a salted code of IP address and
browser that includes the date, so it changes daily and can't be traced to a person or followed across days. Players
with Do Not Track or Global Privacy Control switched on aren't counted. The How To Play page tells players this.
Figures older than about 13 months are deleted automatically. The admin's preview of unpublished questions isn't counted.

How it fits together: `engine/js/core/analytics.js` (in the game), `netlify/functions/stats.mjs` and `server/stats/`
(the server), `netlify/database/migrations/0002_create-stats.sql` (the tables, created on the next deploy) and
`admin/stats.html` (the dashboard). Advert sign-ups aren't visible here: those are in the advertiser's affiliate account.

## How the game works

These rules come from the engine and apply to every edition. Stage names, the prize and the wording come from each
edition's data; the examples here are from the Celtic edition.

- A ladder of stages, set in the edition's `data/meta/stages.json`. Celtic has 8: 1st Qualifier → 2nd Qualifier → Playoff → First Round → Second Round → Quarter Finals → Semi Final → Final.
- One question per stage. A wrong answer means elimination.
- One question per stage is followed, when you get it right, by a spinning newspaper splash (Celtic: "Celtic Progress in Europe").
  It clears itself after about three seconds, or tap or press any key to skip it.
- **Sound:** a crowd cheer plays after each correct answer. Turn it on or off on the How To Play page (saved in
  the browser). The cheer is generated in the browser; to use a real recording instead, save it as
  `editions/<name>/assets/sfx/cheer.mp3` (make sure you're allowed to use it). To switch sound off for everyone and
  hide the toggle, set `"sound": { "enabled": false }` in the edition's `data/edition.json` (Celtic: off for now).
- **Adverts:** an edition can play a short video between stages, after the newspaper (Celtic: after the First Round,
  halfway through the eight stages).
  It plays muted, a Skip button appears after a few seconds, and the time it holds the game is given back so it
  doesn't count towards your Top 100 time. Adverts after the same stage take turns, one per game, or the edition can
  pick them at random (Celtic does). They are managed
  on the [Adverts tab](#managing-adverts) and stored in the edition's `data/adverts.json`. The videos live in
  `media/ads/` at the project root (the compressed 720p copies only; see `media/ads/README.md`). If a video is
  missing the game simply carries on.
- **50:50:** once per game, removes two wrong answers. It isn't handed back if you play on into a new season.
- **Seasons:** win the Final and you can start another season as holders, from the stage set by `seasons.restartStage`
  (Celtic: the First Round, five questions). You can keep going until a wrong answer, and you keep the prizes already won.
- If you refresh mid-game you can resume; ending the campaign instead counts as being knocked out at that stage.
- Keyboard: `A`–`D` or `1`–`4` to answer, `F` for 50:50.
- Statistics are saved in the browser (localStorage).
- **Top 100:** anyone who finishes a game can enter their name and city or town. It ranks by most prizes won,
  then the furthest round reached, then players who didn't use the 50:50, then the fastest time. A champion who
  plays on keeps one row, which is updated as they win more. The board is online and shared by all players (see
  [Online Top 100](#online-top-100)). The ranking rules are in `engine/js/game/ranking.js`, used by the game and the server.

## Reviewing questions

Each edition has its own questions, in three files in `editions/<name>/data/questions/`:

- `pending-questions.json`: waiting for review
- `approved-questions.json`: live in the game
- `rejected-questions.json`: rejected, with the reason

In the edition's `admin-review.html` you can approve, reject (with a reason), edit, add, import and export questions.
The search box on the Review page looks through the question, answers, tags and labels, and also finds questions by
id: `q_000527`, `q527`, or several ids at once. The status filter starts on Pending; if a search finds nothing there,
a button offers to show the matches in all questions.
The dashboard's **Assign Questions To Rounds** panel lets you move any question to another round, or change its
difficulty, without sending approved questions back for review. Click a round name in the coverage table to jump to its questions.
Every question is checked automatically before approval: length, four different answers, a valid
correct answer, stage, category, difficulty, and duplicates against the approved list.

### Publishing

A browser can't change files on your disk by itself, so your changes are kept in the browser until you **Publish**:

- **Chrome / Edge:** Publish asks you to pick the edition's `data/questions` folder (e.g. `editions/celtic/data/questions`) once, then saves the three files directly.
  This only works when the admin page is open on `http://127.0.0.1:5500` or `http://localhost:5500`. On the PC's network
  address (e.g. `http://192.168.1.72:5500`, used for phone testing) the browser blocks saving to folders, so Publish downloads
  the files instead.
- **Other browsers:** Publish downloads the three files. Copy them into the edition's `data/questions` folder, replacing the old ones.

The project's `.vscode/settings.json` tells Live Server to ignore the `data` folder. Without it, Live Server
reloads the page after the first file is saved and the other files are never written.

Until you publish, the game in the **same browser** uses your unpublished questions and shows a "Preview mode" chip,
so you can try changes first.

If new questions are added to the files while you have unpublished changes (for example a new batch in
`pending-questions.json`), the review page adds them to your unpublished copy when it next loads, so they are not hidden
or lost on the next Publish.

## Managing adverts

The **Adverts** tab on the edition's `admin-review.html` lists every advert with a video preview. For each one you can:

- switch it **on or off**;
- give it a **Show from** and/or **Show until** date, so a time-limited advert starts and stops by itself (both days
  included, using the player's own date). Its badge says **Showing now**, **Starts …**, **Ended …** or **Off**;
- change the stage it **plays after**, when the **Skip** button appears, the **advertiser name** shown under the
  video, the **button text** and the **link**;
- change the **turn order** (adverts after the same stage take turns in the order listed), or **delete** it.

The **Order** setting above the list chooses how adverts are picked. **Take turns** plays each advert after its own
stage. **Random** (Celtic) treats every stage that has an advert as an advert break and plays any of the adverts
showing today in each one, picked at random, never the same advert twice in one game. It is saved as `"order"` in
`adverts.json`.

The panel at the top says which adverts are showing today. Changes are kept in the browser until you click
**Save Adverts** (separate from the questions' Publish). The first time, Chrome or Edge asks for the edition's `data`
folder (e.g. `editions/celtic/data`, the one with `edition.json` in it); other browsers download `adverts.json` to
copy there. Then push to `live` as usual. The game reads the adverts file fresh each time it starts, so phones get
the change as soon as the site is rebuilt, and dated adverts switch on and off by themselves without another push.

**A new advert:** put its compressed videos in `media/ads/`, then click **Add Advert**, type the file names (just the
file name is enough) and fill in the rest. The tab checks the files are there. New adverts start switched off.

## Seed questions: please fact-check

The Celtic edition's starter questions (48 approved, 10 pending) were written from general knowledge and should be checked
before you rely on them. Some pending questions are broken on purpose so you can see the validation working:

- `q_000106`: two identical answers
- `q_000107`: duplicate of an approved question
- `q_000108`: too short
- `q_000109`: no question mark and the wrong difficulty for its stage (warnings only)
- The last pending question uses the old format from the original brief and is upgraded automatically on load.
  Its old id clashes with an approved question, so it gets a new id.

## Project layout

One shared engine, and one folder per edition. A fix to the engine reaches every edition.

```
index.html                 lists the editions (development only)
engine/                    shared by every edition
  css/                     base, components, animations, game, admin; chrome.css is the game show look
  js/core/                 config, edition wording, storage, validation, search, migrations, sound, utilities
  js/data-sources/         JSON loading, admin working copy, publishing
  js/game/                 engine (pure rules), picker, controller, stats, leaderboard, screens
  js/admin/                admin store and views
  js/ui/                   DOM helpers, modal, toast, ladder
editions/
  celtic/
    index.html             the game page (loads ../../engine)
    admin-review.html      question review
    manifest.webmanifest   home-screen app settings
    theme.css              colours and design tokens
    assets/                logo, prize image, icons (and sfx/cheer.mp3 if added)
    data/edition.json      the edition's wording
    data/adverts.json      the adverts played between stages (Adverts tab)
    data/meta/             stages.json, categories.json
    data/questions/        pending / approved / rejected
    data/imports/          question batches as they were first written
media/ads/                 advert videos played between stages (compressed 720p copies)
netlify/functions/         the online Top 100 and site statistics APIs (Netlify Functions)
netlify/database/          the Top 100's database tables (migrations)
server/top100/             the Top 100's checks, word filter and storage, used by the function
moderation/                banned-words.json, the Top 100 word filter
admin/top100.html          Top 100 moderation page (published at /admin/top100.html)
admin/stats.html           site statistics dashboard (published at /admin/stats.html)
server/stats/              the site statistics: event checks, report and storage
tools/build.js             makes dist/, the game-only copy for a web host (dist/ is not in git)
tools/dev-server.mjs       local server with a working Top 100 (npm run dev)
netlify.toml               tells Netlify how to build the test site from the live branch
tests/                     browser unit tests (run against the Celtic data); tests/server/ for the Top 100 server
```

## Edition wording

Everything that makes an edition what it is lives in its own folder, e.g. `editions/celtic/`. The wording is in `data/edition.json`:
the team and prize names, the newspaper name and headlines, the home page title and tagline, and the How To Play,
results, Top 100 and stats wording. `{team}`, `{prize}`, `{prizes}`, `{champion}`, `{game}` and `{start}` are
filled in from its `vars` section. Stage names are in `data/meta/stages.json`. `seasons.restartStage` sets where a
champion's next season starts.

The colours are in `theme.css`, the images in `assets/`, and the page titles in the two pages and the manifest.
Both pages also have a `<meta name="storage-prefix">` tag, which keeps each edition's stats, Top 100 and unpublished
admin changes separate. Every edition needs its own prefix. Publish also remembers a separate question folder per edition.

### Starting a new edition

Copy `editions/celtic` to `editions/<name>`, then change `data/edition.json` (including its `id`, which must match
the folder name), the stages, categories and questions, `theme.css`, the images, the titles, and the storage prefix.
Add a line for it to the root `index.html` and to the [Editions](#editions) table above. For its online Top 100,
add it to `server/top100/editions.js` (the build warns if you forget) and, if needed, give it its own word list under
`editions` in `moderation/banned-words.json`.

## Adding to it later

- **More stages or categories:** edit the edition's `data/meta/stages.json` or `categories.json`.
- **A cloud database:** add a new data source next to `engine/js/data-sources/json-file-source.js` with the same functions.
- **Schema changes:** bump `schemaVersion` and add a step in `engine/js/core/migrations.js`.
