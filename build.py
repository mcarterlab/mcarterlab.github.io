#!/usr/bin/env python3
"""Build the gallery index from the game folders.

The gallery AUTO-POPULATES from the repo structure: a folder is a game iff it holds a
game.json. Add `games/<name>/` + a `game.json`, run this, and the game appears on the
index with no hand-editing of index.html. That is the whole point of the structure.

    python build.py

Writes index.html at the repo root. Read-only over everything else.
"""
import json
import pathlib
import html

ROOT = pathlib.Path(__file__).resolve().parent

CARD = """      <a class="card" href="{slug}/">
        <div class="card-top">
          <span class="card-title">{title}</span>
          <span class="card-genre">{genre}</span>
        </div>
        <p class="card-tag">{tagline}</p>
        <span class="card-play">Play &rarr;</span>
      </a>"""

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Games &mdash; Matthew Carter</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ min-height: 100%; background: #0b0b0f; }}
  body {{
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    color: #dcdce4; padding: 48px 20px 64px;
    background:
      radial-gradient(1100px 520px at 50% -10%, rgba(120,90,255,.10), transparent 60%),
      radial-gradient(900px 480px at 85% 110%, rgba(255,120,180,.07), transparent 60%),
      #0b0b0f;
  }}
  .wrap {{ max-width: 960px; margin: 0 auto; }}
  header {{ margin-bottom: 34px; }}
  h1 {{ font-size: 27px; font-weight: 700; letter-spacing: .01em; color: #fff; }}
  h1 .dim {{ color: #6f6f80; font-weight: 500; }}
  .lede {{ margin-top: 10px; font-size: 14px; line-height: 1.6; color: #9a9aa8; max-width: 60ch; }}
  .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }}
  .card {{
    display: flex; flex-direction: column; gap: 10px;
    padding: 18px 18px 16px; border-radius: 14px;
    background: rgba(20,20,27,.72);
    border: 1px solid rgba(255,255,255,.08);
    text-decoration: none; color: inherit;
    transition: border-color .14s, transform .14s, background .14s;
  }}
  .card:hover {{ border-color: rgba(150,130,255,.45); transform: translateY(-2px); background: rgba(26,26,36,.85); }}
  .card-top {{ display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }}
  .card-title {{ font-size: 17px; font-weight: 700; color: #fff; letter-spacing: .04em; }}
  .card-genre {{
    font-size: 10px; text-transform: uppercase; letter-spacing: .13em;
    color: #8d84e0; border: 1px solid rgba(140,130,225,.35);
    padding: 2px 7px; border-radius: 5px; white-space: nowrap;
  }}
  .card-tag {{ font-size: 13px; line-height: 1.55; color: #adadba; flex: 1; }}
  .card-play {{ font-size: 12.5px; font-weight: 600; color: #b9a7ff; letter-spacing: .02em; }}
  .card:hover .card-play {{ color: #d6c9ff; }}
  .empty {{ color: #6f6f80; font-size: 14px; }}
  footer {{ margin-top: 42px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.07);
           font-size: 12px; color: #6a6a78; line-height: 1.7; }}
  footer a {{ color: #8f86dd; text-decoration: none; }}
  footer a:hover {{ text-decoration: underline; }}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Games <span class="dim">&mdash; Matthew Carter</span></h1>
      <p class="lede">Small browser games, built to be opened and played with no install.
      Every one is a single self-contained page. Names are working titles.</p>
    </header>
    <main class="grid">
{cards}
    </main>
    <footer>
      Built and verified by directing AI agents. Source and more:
      <a href="https://github.com/mcarterlab">github.com/mcarterlab</a><br>
      These are the ad-free builds. The ad-integrated versions are headed for CrazyGames.
    </footer>
  </div>
</body>
</html>
"""


def main() -> int:
    games = []
    for d in sorted(ROOT.iterdir()):
        meta = d / "game.json"
        if not (d.is_dir() and meta.is_file() and (d / "index.html").is_file()):
            continue
        data = json.loads(meta.read_text(encoding="utf-8"))
        data["slug"] = d.name
        games.append(data)

    if games:
        cards = "\n".join(
            CARD.format(
                slug=html.escape(g["slug"], quote=True),
                title=html.escape(g["title"]),
                genre=html.escape(g["genre"]),
                tagline=html.escape(g["tagline"]),
            )
            for g in games
        )
    else:
        cards = '      <p class="empty">No games found. Add a folder with a game.json.</p>'

    (ROOT / "index.html").write_text(PAGE.format(cards=cards), encoding="utf-8")
    print(f"wrote index.html with {len(games)} game(s): {', '.join(g['slug'] for g in games)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
