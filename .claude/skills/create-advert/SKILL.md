---
name: create-advert
description: Build a 9-second video advert for a game edition (usually an Amazon affiliate product) and wire it into the edition's advert breaks. Use when the user asks to make, create or build an advert/ad for an edition, e.g. "make an advert for the Oasis edition", "create an ad for this product", "/create-advert".
argument-hint: [edition] [affiliate link] [notes]
---

# Create an advert

You build an HTML advert in the Marketing project, render it to MP4 with `tools/render-video`, copy the 720p videos
into the game and add it to the edition's `data/adverts.json`. The most recent adverts are the best examples to copy:

- `Who Wants To Games - Marketing/editions/beatles/Adverts/trivial-pursuit/` (Amazon product, Beatles black/silver look)
- `Who Wants To Games - Marketing/editions/celtic/Adverts/celtic-in-the-fifties/` (Amazon book, Celtic green/gold look)

Paths below starting `Marketing/` mean `C:\Claude Projects\Who Wants To Games - Marketing\`; `Game/` means
`C:\Claude Projects\Who Wants To Games\`.

## 0. Ask the questions

First list the editions: every folder in `Game/editions/`. An edition is **live** if it has `index.html` and
`data/meta/stages.json`. Show names as the user says them (Celtic, Beatles, Oasis, Glasgow, Scottish Football,
Britpop, Creation Records, Banter Years…), but remember the real folder name.

Then ask with **one AskUserQuestion call holding four questions** (it allows at most four, each with 2–4 options;
every question also gets a free-text "Other" box). Skip a question only if the user's message already answered it.

1. **What game edition?** Options: up to four editions, live ones first (most recently advertised first). Name the
   remaining editions in the question text: "Other editions: Oasis, Glasgow, … (type one in Other)".
2. **Affiliate link?** Question text: "Paste the affiliate link into the 'Other' box below (e.g.
   https://link.amazon/…)." Header: "Link". Options, in this order: "No link yet" (description: "Build the video
   only; the advert stays switched off") and "Paste it in chat instead" (description: "Only if the Other box won't
   take it"). Add "Link is in my message" first only if it is. The answer to this question is normally the URL itself
   (typed into Other). If they chose to paste it in chat, wait for it. If a URL turns up in any other answer (e.g.
   the further-information box), use that.
3. **Show from date?** Options: "Today (dd/mm/yyyy)" with today's date filled in, marked (Recommended). Other: any
   date as dd/mm/yyyy.
4. **Show to date?** Options: "No end date" (Recommended) and "In 4 weeks (dd/mm/yyyy)" with the date filled in.
   Other: a date as dd/mm/yyyy.

Then a **second AskUserQuestion call** with one question:

5. **Any further information?** Text: "Type anything else in Other: better images, product facts, wording, a
   different button label, a different advert break…". Options: "Nothing else" and "I'll attach images/files in chat".

Turn the dates into ISO (`2026-11-22`) for `adverts.json`; "No end date" is `null`. If the to-date is before the
from-date, ask again.

## 1. Find out about the product

- **Short links.** Follow the link with a GET (HEAD returns 404 on link.amazon):
  `curl -s -o /dev/null -L --max-redirs 8 -A "Mozilla/5.0" -w "%{url_effective}\n" "<link>"`.
  Note the final page, the ASIN, and whether `tag=whowantstowin-21` is on it. If the tag is missing, tell the user.
- **Amazon pages.** WebFetch often gets 503 from Amazon. Download the page into the scratchpad instead with curl, a
  desktop Chrome User-Agent, `-H "Accept-Language: en-GB"` and `--compressed`, then pull out `productTitle`, the
  `feature-bullets` list, the price (`a-offscreen`) and the `"hiRes":"…"` image URLs.
- **Check the facts.** Sellers sometimes paste in another product's bullets (the Beatles Trivial Pursuit listing had
  Scooby-Doo Cluedo bullets). Only use facts that the title, the box/cover photo or the user's notes agree with.
  Leave the price out of the advert, because it changes.
- Read any extra pages the user gave in step 5.
- **Shop links (not Amazon)**, e.g. a `*.myspreadshop.co.uk` store: there is no tag to check. Read the shop's home
  page for its tagline (`og:description`) and product range, use "Shop Now" as the button and show the web address in
  the copy. Build it as a product card cycling through 5 shots, like
  `Marketing/editions/celtic/Adverts/rhebel-rhebel/` or `Marketing/editions/glasgow/Adverts/get-around-glasgow/`.
  A folder of images the user names in step 5 counts as supplied for this advert.

## 2. Choose the artwork

- Download the listing's hi-res images to the scratchpad and look at them. Pick the clean product shot on a white
  background: it multiplies onto the pale card so the white disappears. Images the user supplies beat listing images.
- A **flat book cover** (often the only good book image) must not be multiplied. Show it as a book instead: drop
  shadow plus a spine-crease overlay, as in `Marketing/editions/beatles/Adverts/epstein-1967/`. Its close-up should
  sit about 110% wide so the cover's title isn't cut off at the sides. Put the card's tag in the bottom corner
  (`bottom: 28px`), because a top-corner tag covers the start of the cover's title. Celtic example:
  `Marketing/editions/celtic/Adverts/jungle-days/`.
- A **landscape cover** needs a wide card (landscape ~780x630, portrait ~960x860) and a close-up that pans
  sideways across it. Example: `Marketing/editions/glasgow/Adverts/depardon-glasgow/` (also the Glasgow "Red Wash"
  look: red/bone/black, Anton with a red offset print, Special Elite typewriter text, grain, the edition's gig photo).
- Listings sometimes include images of other products (the Depardon listing's 2nd image was a different book).
- Use only the product's own listing photos or images the user supplied for this advert. Never use press photos of
  players or bands, or anything from the OneDrive folders the user hasn't cleared (see the Marketing memory note).
- Copy the chosen image into `Marketing/editions/<edition>/Adverts/<advert-slug>/media/` with a plain name
  (`box.jpg`, `book.jpg`, `product.jpg`). The slug is short and lowercase, e.g. `trivial-pursuit`, `oasis-boxset`.

## 3. Build advert.html

Copy the closest example's `advert.html` and change it:

- **Look.** Match the edition: read `Game/editions/<edition>/theme.css` (colours, `--font-title`) and `edition.css`,
  and the Google Fonts line in its `index.html`. Give the background one quiet themed motif (Celtic: hoops; Beatles:
  a turning vinyl record and flashbulbs). Keep it behind the copy and dark enough not to hurt legibility.
- **Size and timing (same for every advert).** 9 seconds, stage 1920x1080 for landscape and 1080x1920 for
  `?size=portrait`. Timeline: card in 0.15s · eyebrow 0.5s · title slams 1.0s · key fact 2.3s · close-up shot 2.9s ·
  blurb 3.6s · "Available on Amazon" (or where to buy) 4.8s · whole product again 5.4s · tag on the card 6.0s ·
  button 6.2s (then pulsing) · fade to black 8.6s.
- **Copy.** Eyebrow (brand/series), big title (product name), one key fact (e.g. "600 Questions"), a one-line blurb
  that speaks to fans of the edition, where to buy, and an "Order Now" button unless the user asked for other wording.
  British spelling. Short enough to read in the time it's on screen.
- **Close-up.** Set the `closePan` translate percentages so the most recognisable part of the product (title, label,
  cover art) is centred in the card, in both shapes.
- Update the comment block at the top (product, artwork source, timeline).

## 4. Check the frames

From `Marketing/tools/render-video`:

```
node snap.js "../../editions/<edition>/Adverts/<slug>/advert.html" "<scratchpad>/snaps" landscape 1.2,4,7.5
node snap.js "../../editions/<edition>/Adverts/<slug>/advert.html" "<scratchpad>/snaps" portrait 1.2,4,7.5
```

Look at every PNG. Check that nothing overlaps or runs off the edge (portrait's copy area is tight), the close-up shows
the right part, the white around the product has vanished and the background doesn't fight the text. Fix and re-snap.

## 5. Render

```
node render.js "../../editions/<edition>/Adverts/<slug>/advert.html" "../../editions/<edition>/Adverts/<slug>/output" --name <edition>-<slug> --duration 9 --only landscape,portrait
```

Use a timeout of 10 minutes. It writes 1080p masters and compressed 720p copies. Add `square,feed45` to `--only` only
if the user wants social media versions.

## 6. Wire it into the game (live editions only)

- Copy the two 720p files (`*-landscape-1280x720.mp4`, `*-portrait-720x1280.mp4`) into `Game/media/ads/`.
- Add an entry to `Game/editions/<edition>/data/adverts.json` and update `updatedAt`:

```json
{
  "id": "<slug>", "name": "<Product name>", "enabled": true,
  "from": "<ISO from>", "until": <ISO to or null>,
  "after": "<stage key>",
  "label": "<Short name shown in the game>", "url": "<affiliate link>", "linkText": "Order Now",
  "landscape": "../../media/ads/<file>-landscape-1280x720.mp4",
  "portrait": "../../media/ads/<file>-portrait-720x1280.mp4",
  "skipAfterMs": 5000
}
```

- **`after` must be a `key` from that edition's `data/meta/stages.json`.** Stage keys differ between editions
  (Celtic: `round-1`; Beatles: `royal-albert-hall`; Glasgow: `qmu`). Unless the user named a break, use the stage the admin page
  defaults to: the 4th stage (index `min(3, stages - 2)`). Adverts sharing a break take turns, one per game.
- If there is no affiliate link yet, add the entry with `"enabled": false` and say so.
- If the edition isn't live, skip this step and say the videos are ready for when it is.
- Add the two files and a source line to the tables in `Game/media/ads/README.md`.

## 7. README and report

Write `Marketing/editions/<edition>/Adverts/<slug>/README.md` like the examples: product and facts used, the link and
where it forwards (with the tag check and date), a timeline table, the files, and the re-render command.

Tell the user, briefly: what the advert shows, the link check result, any facts you left out and why, where the files
are, and which break and dates it is set to. Show them a still frame if they'd like to see one.

**Don't commit or push** unless the user asks. Netlify builds cost credits, so changes are batched into one push.
