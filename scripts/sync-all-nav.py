#!/usr/bin/env python3
"""Force identical AI nav on every public page."""

from __future__ import annotations

import re
from pathlib import Path

PUBLIC = Path(__file__).resolve().parents[1] / "public"
SKIP = {"ai-talk.html", "ai-talk-popup.html", "email-orb-launcher.html", "a1_hero_preview.html"}

AI_NAV = '<a href="ai-talk.html" class="ai-nav">Artificial Intelligence Team Member</a>'
AI_MOBILE = '<a href="ai-talk.html">Artificial Intelligence Team Member</a>'

CANONICAL_MOBILE = """<div class="mobile-menu" id="mobileMenu">
  <a href="index.html#services">Services</a>
  <a href="sealcoating.html">Sealcoating</a>
  <a href="crack-filling.html">Crack Filling</a>
  <a href="parking-lot-striping.html">Parking Lot Striping</a>
  <a href="asphalt-patching.html">Asphalt Paving / Sealing</a>
  <a href="concrete-work.html">Concrete Finishing</a>
  <a href="bollard-installation.html">Bollards / Signage</a>
  <a href="our-work.html">Our Work</a>
  <a href="about.html">About</a>
  <a href="ai-talk.html">Artificial Intelligence Team Member</a>
  <a href="tel:13149495660">(314) 949-5660</a>
  <a href="sms:13149495660" title="Text a real person — not a chatbot">Text Us</a>
</div>"""

MOBILE_MENU_RE = re.compile(r'<div class="mobile-menu" id="mobileMenu">.*?</div>\s*', re.DOTALL)
AI_NAV_ANY_RE = re.compile(
    r'<a[^>]*class="ai-nav"[^>]*>Artificial Intelligence Team Member</a>'
)
AI_LINK_VARIANTS_RE = re.compile(
    r'<a[^>]*href="[^"]*"[^>]*>(?:Artificial Intelligence Team Member|Talk with Our A\.I\. Team Member)</a>'
)
OVERLAY_RE = re.compile(r'<div id="vox-overlay"[^>]*>.*?</div>\s*', re.DOTALL)
OPENVOX_RE = re.compile(r'onclick="openVox\(\)"')


def fix_nav_actions(html: str) -> str:
    if 'class="nav-actions"' not in html:
        return html
    block = re.search(r'<div class="nav-actions">.*?</div>', html, re.DOTALL)
    if not block:
        return html
    original = block.group(0)
    if AI_NAV in original:
        return html
    updated = AI_NAV_ANY_RE.sub(AI_NAV, original)
    if updated == original and AI_NAV not in original:
        updated = original.replace(
            '<div class="nav-actions">',
            '<div class="nav-actions">\n    ' + AI_NAV,
            1,
        )
    return html[: block.start()] + updated + html[block.end() :]


def fix_mobile_menus(html: str) -> str:
    html = MOBILE_MENU_RE.sub("", html)
    insert_at = html.find('<div class="nav-stripe"')
    if insert_at == -1:
        insert_at = html.find("</header>")
        if insert_at == -1:
            return html
        insert_at = html.find("\n", insert_at) + 1
        return html[:insert_at] + "\n" + CANONICAL_MOBILE + "\n" + html[insert_at:]
    return html[:insert_at] + CANONICAL_MOBILE + "\n" + html[insert_at:]


def clean(html: str) -> str:
    html = OPENVOX_RE.sub("", html)
    html = OVERLAY_RE.sub("", html)
    html = re.sub(r'<script src="assets/vox\.js"></script>\s*', "", html)
    html = re.sub(r'<link rel="stylesheet" href="assets/vox\.css"[^/]*/>\s*', "", html)
    html = html.replace('voxtalk-embed.html', 'ai-talk.html')
    html = html.replace('https://a1-asphalt-voxtalk-3.onrender.com/" target="_blank"', 'ai-talk.html"')
    html = fix_nav_actions(html)
    html = fix_mobile_menus(html)
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
    print(f"Synced {len(changed)} files:")
    for name in changed:
        print(f"  - {name}")


if __name__ == "__main__":
    main()
