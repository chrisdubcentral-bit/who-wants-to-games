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

Sources, in `Who Wants To Games - Marketing/editions/CelticPools/Adverts/` (Celtic Pools) and
`…/editions/celtic/Adverts/` (everything else):

- Weekly lottery: `weekly-lottery/output/`.
- Beanie promo: `BeaniePromo/`. Its files are smaller than their names say (832x464 and 464x832), and two are named
  with the wrong shape: `Beanie-CelticPools-Landscape-1280x720.MP4` and `Beanie-CelticPools-Portrait-1080x1920.MP4` are
  the ones used here.
- Rhebel Rhebel t-shirts: `rhebel-rhebel/output/` (9 seconds, links to the shop at rhebelrhebel.myspreadshop.co.uk).
