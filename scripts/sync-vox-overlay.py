#!/usr/bin/env python3
"""Sync VoxTalk overlay markup and iframe src across public HTML pages."""

from __future__ import annotations

import re
from pathlib import Path

PUBLIC = Path(__file__).resolve().parents[1] / "public"

FULLSCREEN_PAGES = {"index.html", "contact.html", "strip-malls.html"}

FULLSCREEN_OVERLAY = """<div id="vox-overlay" class="vox-fullscreen" onclick="if(event.target===this)closeVox()">
  <button id="vox-close-btn" type="button" onclick="closeVox()" aria-label="Close AI chat">&#10005;</button>
  <div class="vox-stage">
    <iframe id="vox-iframe" src="voxtalk-embed.html" title="A1 AI Team Member" allow="microphone"></iframe>
  </div>
  <div class="vox-hint">Click outside to return</div>
</div>"""

WIDGET_OVERLAY = """<div id="vox-overlay" class="vox-widget">
  <button id="vox-close-btn" type="button" onclick="closeVox()" aria-label="Close AI chat">&#10005;</button>
  <iframe id="vox-iframe" src="voxtalk-embed.html?autostart=1" title="A1 AI Team Member" allow="microphone"></iframe>
</div>"""

OLD_FULLSCREEN_RE = re.compile(
    r'<div id="vox-overlay"[^>]*>.*?</div>\s*(?=<script>|</body>)',
    re.DOTALL,
)

INLINE_WIDGET_RE = re.compile(
    r'<div id="vox-overlay" style="display:none;position:fixed;bottom:90px;right:24px;[^"]*">.*?</div>\s*<script>function openVox\(\)[^<]*</script>',
    re.DOTALL,
)

INLINE_VOX_CSS_RE = re.compile(
    r"#vox-overlay\{display:none;position:fixed;bottom:90px;right:24px;[^}]+\}\s*"
    r"#vox-overlay\.open\{display:block;[^}]+\}\s*"
    r"(?:@keyframes voxIn\{[^}]+\}\s*)?"
    r"#vox-overlay iframe\{[^}]+\}\s*"
    r"#vox-close-btn\{[^}]+\}\s*",
    re.DOTALL,
)

OPEN_CLOSE_FN_RE = re.compile(
    r"function openVox\(\)\{[^}]+\}\s*function closeVox\(\)\{[^}]+\}\s*",
    re.DOTALL,
)

VOXTALK_URL_RE = re.compile(
    r"https://a1-asphalt-voxtalk-3\.onrender\.com/?",
)


def ensure_assets(html: str) -> str:
    if "assets/vox.css" not in html:
        if '<link rel="stylesheet" href="styles.css"' in html:
            html = html.replace(
                '<link rel="stylesheet" href="styles.css"',
                '<link rel="stylesheet" href="styles.css"/>\n<link rel="stylesheet" href="assets/vox.css"',
                1,
            )
        elif '<link rel="stylesheet" href="assets/site-nav.css' in html:
            html = html.replace(
                '<link rel="stylesheet" href="assets/site-nav.css',
                '<link rel="stylesheet" href="assets/vox.css"/>\n<link rel="stylesheet" href="assets/site-nav.css',
                1,
            )
        elif "</head>" in html:
            html = html.replace(
                "</head>",
                '<link rel="stylesheet" href="assets/vox.css"/>\n</head>',
                1,
            )

    if "assets/vox.js" not in html:
        if "</body>" in html:
            html = html.replace("</body>", '<script src="assets/vox.js"></script>\n</body>', 1)
    return html


def strip_inline_vox_js(html: str) -> str:
    html = OPEN_CLOSE_FN_RE.sub("", html)
    html = re.sub(
        r'document\.addEventListener\("keydown",function\(e\)\{if\(e\.key==="Escape"\)closeVox\(\);\}\);',
        "",
        html,
    )
    html = re.sub(
        r"document\.addEventListener\('keydown',function\(e\)\{if\(e\.key==='Escape'\)closeVox\(\);\}\);",
        "",
        html,
    )
    html = re.sub(
        r"document\.addEventListener\('keydown',function\(e\)\{if\(e\.key==='Escape'\)closeVox\(\);\}\);",
        "",
        html,
    )
    html = re.sub(
        r'document\.addEventListener\("click",function\(e\)\{var o=document\.getElementById\("vox-overlay"\);if\(o\.style\.display==="block"[^}]+\}\);\s*',
        "",
        html,
    )
    html = re.sub(
        r"document\.addEventListener\('click',function\(e\)\{var o=document\.getElementById\('vox-overlay'\);if\(o\.style\.display==='block'[^}]+\}\);\s*",
        "",
        html,
    )
    return html


def process_file(path: Path) -> bool:
    name = path.name
    html = path.read_text(encoding="utf-8")
    original = html

    html = ensure_assets(html)
    html = INLINE_VOX_CSS_RE.sub("", html)
    html = strip_inline_vox_js(html)

    if name in FULLSCREEN_PAGES:
        if 'id="vox-overlay"' in html:
            html = OLD_FULLSCREEN_RE.sub(FULLSCREEN_OVERLAY + "\n", html, count=1)
        else:
            html = html.replace("</body>", FULLSCREEN_OVERLAY + "\n</body>", 1)
    else:
        if INLINE_WIDGET_RE.search(html):
            html = INLINE_WIDGET_RE.sub(WIDGET_OVERLAY, html, count=1)
        elif 'id="vox-overlay"' in html:
            html = OLD_FULLSCREEN_RE.sub(WIDGET_OVERLAY + "\n", html, count=1)
        elif 'onclick="openVox()"' in html:
            html = html.replace("</body>", WIDGET_OVERLAY + "\n</body>", 1)

    # Standalone pages keep direct remote URL except embed wrapper pages
    if name in {"ai-talk.html", "ai-talk-popup.html"}:
        html = VOXTALK_URL_RE.sub("voxtalk-embed.html", html)
    elif name != "voxtalk-embed.html":
        html = VOXTALK_URL_RE.sub(
            "voxtalk-embed.html?autostart=1" if name not in FULLSCREEN_PAGES else "voxtalk-embed.html",
            html,
        )

    if html != original:
        path.write_text(html, encoding="utf-8")
        return True
    return False


def main() -> None:
    changed = []
    for path in sorted(PUBLIC.glob("*.html")):
        if process_file(path):
            changed.append(path.name)
    print(f"Updated {len(changed)} files:")
    for name in changed:
        print(f"  - {name}")


if __name__ == "__main__":
    main()
