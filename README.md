# Who Wants To Win The European Cup — Celtic Edition

A Celtic-themed football quiz in the "Celtic European Nights" style, plus a question review system.
Plain HTML, CSS and JavaScript. No frameworks, no build step.

## Running it

The pages load their questions from JSON files, and browsers block that when a page is opened
by double-clicking. Run it from a local web server instead:

1. Open this folder in VS Code.
2. Install the **Live Server** extension (by Ritwick Dey) if you don't have it.
3. Right-click `index.html` and choose **Open with Live Server**.

| Page | What it is |
|---|---|
| `index.html` | The game |
| `admin-review.html` | Question review (approve, reject, edit, import, publish) |
| `tests/test-runner.html` | Unit tests for the game rules, validation and picker |

## Playing on a phone

The game is one responsive page: on a phone the answers stack in a single column, the tournament
ladder is hidden so the question has the room (the stage name still shows above it) and the 50:50 button stays
within reach at the bottom of the screen. `manifest.webmanifest` and the icons in `assets/img/` let
it be added to a phone's home screen as an app.

### Testing in a desktop browser

In Chrome or Edge press `F12`, then `Ctrl+Shift+M` to toggle the device toolbar and pick a phone such
as "iPhone 14" or "Pixel 7". Refresh after switching so the layout and fonts settle.

### Testing on your phone

1. Make sure the phone and the PC are on the same Wi-Fi.
2. In `.vscode/settings.json`, change `"liveServer.settings.host"` to `"0.0.0.0"` and `"liveServer.settings.useLocalIp"` to `true`,
   then stop and restart Live Server. Change them back to `"127.0.0.1"` and `false` when you finish, because the admin
   page can only save straight into `data/questions` on 127.0.0.1.
3. Find the PC's address: run `ipconfig` in a terminal and look for **IPv4 Address** under your Wi-Fi adapter
   (e.g. `192.168.1.72`).
4. On the phone open `http://<that address>:5500/index.html`.
5. If it doesn't load, Windows Firewall is probably blocking it. The first time Live Server starts you may
   get a prompt asking to allow it on private networks; otherwise allow **Node.js** or **Code** through the
   firewall for private networks.

The phone and the PC each keep their own statistics and Top 100, because those are stored in the browser.

### Adding it to the home screen

- **Android (Chrome):** menu (⋮) → **Add to Home screen**.
- **iPhone (Safari):** Share → **Add to Home Screen**.

Over plain `http://` on your home network this makes a shortcut that opens full-screen. Installing it as a
proper app that works offline needs the game hosted over `https://`, for example on GitHub Pages or Netlify.

## How the game works

- 8 stages: 1st Qualifier → 2nd Qualifier → Playoff → First Round → Second Round → Quarter Finals → Semi Final → Final.
- One question per stage. A wrong answer means elimination.
- One question per stage is followed, when you get it right, by a spinning newspaper splash ("Celtic Progress in Europe").
  It clears itself after about three seconds, or tap or press any key to skip it.
- **Sound:** a crowd cheer plays after each correct answer. Turn it on or off on the How To Play page (saved in
  the browser). The cheer is generated in the browser; to use a real recording instead, save it as
  `assets/sfx/cheer.mp3` (make sure you're allowed to use it).
- **50:50:** once per game, removes two wrong answers. It isn't handed back if you play on into a new season.
- **Seasons:** win the Final and you can start another season as holders, from the First Round (five questions).
  You can keep going until a wrong answer, and you keep the European Cups already won.
- If you refresh mid-game you can resume; ending the campaign instead counts as being knocked out at that stage.
- Keyboard: `A`–`D` or `1`–`4` to answer, `F` for 50:50.
- Statistics are saved in the browser (localStorage).
- **Top 100:** anyone who finishes a game can enter their name and city or town. It ranks by most European Cups,
  then the furthest round reached, then players who didn't use the 50:50, then the fastest time. A champion who
  plays on keeps one row, which is updated as they win more.
  The board is stored in the browser, so it only shows games played on that device. An online board would need a
  hosted database; `js/game/leaderboard.js` keeps the ranking rules separate from storage to make that swap easy.

## Reviewing questions

Questions live in three files in `data/questions/`:

- `pending-questions.json`: waiting for review
- `approved-questions.json`: live in the game
- `rejected-questions.json`: rejected, with the reason

In `admin-review.html` you can approve, reject (with a reason), edit, add, import and export questions.
The search box on the Review page looks through the question, answers, tags and labels, and also finds questions by
id: `q_000527`, `q527`, or several ids at once. The status filter starts on Pending; if a search finds nothing there,
a button offers to show the matches in all questions.
The dashboard's **Assign Questions To Rounds** panel lets you move any question to another round, or change its
difficulty, without sending approved questions back for review. Click a round name in the coverage table to jump to its questions.
Every question is checked automatically before approval: length, four different answers, a valid
correct answer, stage, category, difficulty, and duplicates against the approved list.

### Publishing

A browser can't change files on your disk by itself, so your changes are kept in the browser until you **Publish**:

- **Chrome / Edge:** Publish asks you to pick the `data/questions` folder once, then saves the three files directly.
  This only works when the admin page is open on `http://127.0.0.1:5500` or `http://localhost:5500`. On the PC's network
  address (e.g. `http://192.168.1.72:5500`, used for phone testing) the browser blocks saving to folders, so Publish downloads
  the files instead.
- **Other browsers:** Publish downloads the three files. Copy them into `data/questions`, replacing the old ones.

The project's `.vscode/settings.json` tells Live Server to ignore the `data` folder. Without it, Live Server
reloads the page after the first file is saved and the other files are never written.

Until you publish, the game in the **same browser** uses your unpublished questions and shows a "Preview mode" chip,
so you can try changes first.

If new questions are added to the files while you have unpublished changes (for example a new batch in
`pending-questions.json`), the review page adds them to your unpublished copy when it next loads, so they are not hidden
or lost on the next Publish.

## Seed questions: please fact-check

The starter questions (48 approved, 10 pending) were written from general knowledge and should be checked
before you rely on them. Some pending questions are broken on purpose so you can see the validation working:

- `q_000106`: two identical answers
- `q_000107`: duplicate of an approved question
- `q_000108`: too short
- `q_000109`: no question mark and the wrong difficulty for its stage (warnings only)
- The last pending question uses the old format from the original brief and is upgraded automatically on load.
  Its old id clashes with an approved question, so it gets a new id.

## Project layout

```
css/            tokens, base, components, animations, game, admin styles; chrome.css is the game show look (game only)
js/core/        config, storage, validation, search, migrations, utilities
js/data-sources JSON loading, admin working copy, publishing
js/game/        engine (pure rules), picker, controller, stats, screens
js/admin/       admin store and views
js/ui/          DOM helpers, modal, toast, ladder
data/           edition.json (the edition's wording), question files, stage/category metadata
tests/          browser unit tests
```

## Edition wording

Everything that makes this the Celtic edition is in `data/edition.json`, not in the code: the team and prize names,
the newspaper name and headlines, the home page title and tagline, and the How To Play, results, Top 100 and stats
wording. `{team}`, `{prize}`, `{prizes}`, `{champion}`, `{game}` and `{start}` are filled in from its `vars` section.
Stage names stay in `data/meta/stages.json`. `seasons.restartStage` sets where a champion's next season starts.

Still edition-specific outside that file: the colours (`css/tokens.css`, `css/chrome.css`), the images in `assets/`,
the page titles in `index.html`, `admin-review.html` and `manifest.webmanifest`, and the
`<meta name="storage-prefix">` tag in both pages, which keeps each edition's stats and Top 100 separate.

## Adding to it later

- **More stages or categories:** edit `data/meta/stages.json` or `categories.json`.
- **A cloud database:** add a new data source next to `js/data-sources/json-file-source.js` with the same functions.
- **Schema changes:** bump `schemaVersion` and add a step in `js/core/migrations.js`.
