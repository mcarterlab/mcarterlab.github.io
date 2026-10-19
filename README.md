# mcarterlab.github.io

A gallery of small browser games. Each game is a single self-contained HTML page —
open it and play, no install, no server, no build step for the visitor.

**Live: https://mcarterlab.github.io/**

## Layout

    index.html          the gallery — GENERATED, do not hand-edit
    build.py            reads every */game.json and writes index.html
    <game>/index.html   the game
    <game>/game.json    { title, genre, tagline, status }
    shared/             code shared between games

## Adding a game (the gallery auto-populates)

1. Drop the game in `<name>/` — as `<name>/index.html`.
2. Add `<name>/game.json` with `title`, `genre`, `tagline`, `status`.
3. Run `python build.py` and commit.

The gallery is generated from the folder structure; there is nothing to hand-edit.

## The two builds

- **Ad-free** — what lives here. No ad module, no ad buttons, no ad slots, no ad code
  path. This is the game as it plays with nothing between the player and the loop, so
  the two builds can be compared directly.
- **Ad build** — the portal version. It adds the SDK (rewarded / interstitial / banner)
  at the marked spots; the game itself is otherwise unchanged. Not published here.

The gallery's styling follows the host dashboard: same palette and monospace face
(`--grn:#31e07f` on `--bg:#04070a`), scanline overlay, responsive grid (1 column on a
phone, more as the window widens), content centred in a max-width shell.

## Local preview

    python -m http.server 8099
    # then open http://127.0.0.1:8099/
