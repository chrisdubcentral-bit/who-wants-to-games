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
| `editions/<name>/admin-review.html` | An edition's question review (approve, reject, edit, import, publish) |
| `tests/test-runner.html` | Unit tests for the game rules, validation and picker |

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

The phone and the PC each keep their own statistics and Top 100, because those are stored in the browser.

### Adding it to the home screen

- **Android (Chrome):** menu (⋮) → **Add to Home screen**.
- **iPhone (Safari):** Share → **Add to Home Screen**.

Over plain `http://` on your home network this makes a shortcut that opens full-screen. Installing it as a
proper app that works offline needs the game hosted over `https://`, for example on GitHub Pages or Netlify.

## Sharing a test link

To let people play away from your Wi-Fi, put a game-only copy on a web host. Netlify's free plan is enough.

1. In a terminal in the project folder run `node tools/build.js`. It makes a `dist` folder with the game, the
   approved questions and the advert videos. The question review page, pending and rejected questions, import
   batches and tests are left out.
2. The first time: sign in to Netlify, open `https://app.netlify.com/drop` and drag the `dist` folder onto the page.
   You get a link like `https://something.netlify.app` to send to testers. You can rename it in the site's settings.
3. To update it later: run the build again, open the site in Netlify, go to **Deploys** and drag `dist` onto the page.

Each tester's statistics and Top 100 stay on their own device. Because the link is `https://`, adding it to a phone's
home screen installs it as a proper app. The build asks search engines not to list the site, but anyone with the link
can play, and the approved questions and answers can be read from the page's files, as with any browser game.

## How the game works

These rules come from the engine and apply to every edition. Stage names, the prize and the wording come from each
edition's data; the examples here are from the Celtic edition.

- A ladder of stages, set in the edition's `data/meta/stages.json`. Celtic has 8: 1st Qualifier → 2nd Qualifier → Playoff → First Round → Second Round → Quarter Finals → Semi Final → Final.
- One question per stage. A wrong answer means elimination.
- One question per stage is followed, when you get it right, by a spinning newspaper splash (Celtic: "Celtic Progress in Europe").
  It clears itself after about three seconds, or tap or press any key to skip it.
- **Sound:** a crowd cheer plays after each correct answer. Turn it on or off on the How To Play page (saved in
  the browser). The cheer is generated in the browser; to use a real recording instead, save it as
  `editions/<name>/assets/sfx/cheer.mp3` (make sure you're allowed to use it).
- **Adverts:** an edition can play a short video between stages, after the newspaper (Celtic: after the First Round,
  halfway through the eight stages).
  It plays muted, a Skip button appears after five seconds, and the time it holds the game is given back so it
  doesn't count towards your Top 100 time. The breaks are set in `adverts.breaks` in `data/edition.json` (one file
  for landscape screens and one for phones held upright, and optionally a `url` that tapping the video or the
  link button opens in a new tab). The videos live in `media/ads/` at the project root;
  git ignores them because of their size, so copy them in (see `media/ads/README.md`). If a video is missing the
  game simply carries on.
- **50:50:** once per game, removes two wrong answers. It isn't handed back if you play on into a new season.
- **Seasons:** win the Final and you can start another season as holders, from the stage set by `seasons.restartStage`
  (Celtic: the First Round, five questions). You can keep going until a wrong answer, and you keep the prizes already won.
- If you refresh mid-game you can resume; ending the campaign instead counts as being knocked out at that stage.
- Keyboard: `A`–`D` or `1`–`4` to answer, `F` for 50:50.
- Statistics are saved in the browser (localStorage).
- **Top 100:** anyone who finishes a game can enter their name and city or town. It ranks by most prizes won,
  then the furthest round reached, then players who didn't use the 50:50, then the fastest time. A champion who
  plays on keeps one row, which is updated as they win more.
  The board is stored in the browser, so it only shows games played on that device. An online board would need a
  hosted database; `engine/js/game/leaderboard.js` keeps the ranking rules separate from storage to make that swap easy.

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
    data/meta/             stages.json, categories.json
    data/questions/        pending / approved / rejected
    data/imports/          question batches as they were first written
media/ads/                 advert videos played between stages (the .mp4 files are not in git)
tools/build.js             makes dist/, the game-only copy for a web host (dist/ is not in git)
tests/                     browser unit tests (run against the Celtic data)
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
Add a line for it to the root `index.html` and to the [Editions](#editions) table above.

## Adding to it later

- **More stages or categories:** edit the edition's `data/meta/stages.json` or `categories.json`.
- **A cloud database:** add a new data source next to `engine/js/data-sources/json-file-source.js` with the same functions.
- **Schema changes:** bump `schemaVersion` and add a step in `engine/js/core/migrations.js`.
