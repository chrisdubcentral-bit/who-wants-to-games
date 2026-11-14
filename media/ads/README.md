# Advert videos

Short videos played between stages of the game. Which ones play, and after which stage, is set per edition in
`editions/<name>/data/edition.json` under `adverts.breaks`.

The compressed 720p copies **are committed to git**, because Netlify builds the test site from the repo. The large
1080p masters are not (see `.gitignore`); they stay in the Marketing project (`Who Wants To Games - Marketing`).

Use the compressed 720p copies, not the 1080p masters:

| File | Shape | Used when |
|---|---|---|
| `celtic-pools-weekly-lottery-landscape-1280x720.mp4` | 16:9 | browser / phone held sideways |
| `celtic-pools-weekly-lottery-portrait-720x1280.mp4` | 9:16 | phone held upright |

Source: `Who Wants To Games - Marketing/editions/CelticPools/Adverts/weekly-lottery/output/`.
