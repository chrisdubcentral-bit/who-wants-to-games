# Advert videos

Short videos played between stages of the game. Which ones play, after which stage, and on which dates is set on the
**Adverts** tab of the edition's `admin-review.html`, which saves `editions/<name>/data/adverts.json`. Adverts after
the same stage take turns: one per game (a new season counts as a new game), in the order listed. With the tab's
**Order** set to Random, each advert break instead plays any of the adverts showing that day, picked at random.

The compressed 720p copies **are committed to git**, because Netlify builds the test site from the repo. The large
1080p masters are not (see `.gitignore`); they stay in the Marketing project (`Who Wants To Games - Marketing`).

Use the compressed 720p copies, not the 1080p masters:

| File | Shape | Used when |
|---|---|---|
| `celtic-pools-weekly-lottery-landscape-1280x720.mp4` | 16:9 | browser / phone held sideways |
| `celtic-pools-weekly-lottery-portrait-720x1280.mp4` | 9:16 | phone held upright |
| `celtic-pools-beanie-promo-landscape-832x464.mp4` | 16:9 | browser / phone held sideways |
| `celtic-pools-beanie-promo-portrait-464x832.mp4` | 9:16 | phone held upright |
| `rhebel-rhebel-landscape-1280x720.mp4` | 16:9 | browser / phone held sideways |
| `rhebel-rhebel-portrait-720x1280.mp4` | 9:16 | phone held upright |
| `celtic-in-the-fifties-landscape-1280x720.mp4` | 16:9 | browser / phone held sideways |
| `celtic-in-the-fifties-portrait-720x1280.mp4` | 9:16 | phone held upright |
| `beatles-trivial-pursuit-landscape-1280x720.mp4` | 16:9 | browser / phone held sideways |
| `beatles-trivial-pursuit-portrait-720x1280.mp4` | 9:16 | phone held upright |
| `beatles-epstein-1967-landscape-1280x720.mp4` | 16:9 | browser / phone held sideways |
| `beatles-epstein-1967-portrait-720x1280.mp4` | 9:16 | phone held upright |
| `beatles-rubber-soul-landscape-1280x720.mp4` | 16:9 | browser / phone held sideways |
| `beatles-rubber-soul-portrait-720x1280.mp4` | 9:16 | phone held upright |
| `beatles-liverpool-book-landscape-1280x720.mp4` | 16:9 | browser / phone held sideways |
| `beatles-liverpool-book-portrait-720x1280.mp4` | 9:16 | phone held upright |
| `celtic-jungle-days-landscape-1280x720.mp4` | 16:9 | browser / phone held sideways |
| `celtic-jungle-days-portrait-720x1280.mp4` | 9:16 | phone held upright |

Sources, in `Who Wants To Games - Marketing/editions/CelticPools/Adverts/` (Celtic Pools) and
`…/editions/celtic/Adverts/` (everything else):

- Weekly lottery: `weekly-lottery/output/`.
- Beanie promo: `BeaniePromo/`. Its files are smaller than their names say (832x464 and 464x832), and two are named
  with the wrong shape: `Beanie-CelticPools-Landscape-1280x720.MP4` and `Beanie-CelticPools-Portrait-1080x1920.MP4` are
  the ones used here.
- Rhebel Rhebel t-shirts: `rhebel-rhebel/output/` (9 seconds, links to the shop at rhebelrhebel.myspreadshop.co.uk).
- Celtic in the Fifties book: `celtic-in-the-fifties/output/` (9 seconds, Matt Corr's book, links to Amazon UK via
  https://link.amazon/B0b6VfMs3, which carries the whowantstowin-21 affiliate tag).
- Jungle Days book: `jungle-days/output/` (9 seconds, John Wight's book on supporting Celtic in the 1980s, links to
  Amazon UK via https://link.amazon/B0cvMPYl5, which carries the whowantstowin-21 affiliate tag).
- Beatles Trivial Pursuit (Beatles edition): `…/editions/beatles/Adverts/trivial-pursuit/output/` (9 seconds, links to
  Amazon UK via https://link.amazon/B00nXlBW7, which carries the whowantstowin-21 affiliate tag).
- 1967 – The World of Brian Epstein and The Beatles (Beatles edition): `…/editions/beatles/Adverts/epstein-1967/output/`
  (9 seconds, Gary Kemp and Simon Halfon's book, links to Amazon UK via https://link.amazon/B05BPxPjM, which carries
  the whowantstowin-21 affiliate tag).
- Rubber Soul Super Deluxe box set (Beatles edition): `…/editions/beatles/Adverts/rubber-soul/output/` (9 seconds,
  links to Amazon UK via https://link.amazon/B0gTSoIVr, which carries the whowantstowin-21 affiliate tag).
- The Beatles' Liverpool book (Beatles edition): `…/editions/beatles/Adverts/beatles-liverpool/output/` (9 seconds,
  Mike Haskins' guide, links to Amazon UK via https://link.amazon/B0i6DIVhA, which carries the whowantstowin-21
  affiliate tag).
