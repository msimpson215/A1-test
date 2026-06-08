#!/usr/bin/env python3
"""One AI path everywhere: link to ai-talk.html, remove overlay duplicates."""

from __future__ import annotations

import re
from pathlib import Path

PUBLIC = Path(__file__).resolve().parents[1] / "public"
SKIP = {"ai-talk.html", "voxtalk-embed.html", "email-orb-launcher.html"}

AI_NAV = '<a href="ai-talk.html" class="ai-nav">Artificial Intelligence Team Member</a>'
AI_MOBILE = '<a href="ai-talk.html">Artificial Intelligence Team Member</a>'

OVERLAY_RE = re.compile(
    r'<div id="vox-overlay"[^>]*>.*?</div>\s*',
    re.DOTALL,
)

OPENVOX_NAV_RE = re.compile(
    r'<a href="javascript:void\(0\)" onclick="openVox\(\)" class="ai-nav">Artificial Intelligence Team Member</a>'
)
OPENVOX_MOBILE_RE = re.compile(
    r'<a href="javascript:void\(0\)" onclick="openVox\(\)">Artificial Intelligence Team Member</a>'
)
OPENVOX_YELLOW_RE = re.compile(
    r'<a href="javascript:void\(0\)" onclick="openVox\(\)"([^>]*)>Talk with Our A\.I\. Team Member</a>'
)
EMBED_LINK_RE = re.compile(
    r'<a href="voxtalk-embed\.html[^"]*"[^>]*>([^<]*)</a>'
)


def clean(html: str) -> str:
    html = OPENVOX_NAV_RE.sub(AI_NAV, html)
    html = OPENVOX_MOBILE_RE.sub(AI_MOBILE, html)
    html = OPENVOX_YELLOW_RE.sub(r'<a href="ai-talk.html"\1>Talk with Our A.I. Team Member</a>', html)
    html = EMBED_LINK_RE.sub(r'<a href="ai-talk.html">\1</a>', html)
    html = OVERLAY_RE.sub("", html)
    html = re.sub(r'<link rel="stylesheet" href="assets/vox\.css"[^/]*/>\s*', "", html)
    html = re.sub(r'<script src="assets/vox\.js"></script>\s*', "", html)
    html = html.replace('voxtalk-embed.htmlupload', 'https://a1-asphalt-voxtalk-3.onrender.com/upload')
    return html


def main() -> None:
    changed = []
    for path in sorted(PUBLIC.glob("*.html")):
        if path.name in SKIP:
            continue
        original = path.read_text(encoding="utf-8")
        updated = clean(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed.append(path.name)
    print(f"Updated {len(changed)} files:")
    for name in changed:
        print(f"  - {name}")


if __name__ == "__main__":
    main()
