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

- **Ad-free** — what lives here. The ad stand-in is not loaded; each game detects its
  absence and falls back to its non-ad path (in Starwell, the coin path). The reserved
  banner slot is hidden.
- **Ad build** — the version headed for a portal (CrazyGames). It keeps the ad module
  and swaps the stand-in for the real SDK. Not published here.

## Local preview

    python -m http.server 8099
    # then open http://127.0.0.1:8099/
