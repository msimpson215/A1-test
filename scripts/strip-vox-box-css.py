#!/usr/bin/env python3
"""Remove per-page vox-overlay box CSS so shared fullscreen orb styles apply."""

from pathlib import Path
import re

PUBLIC = Path(__file__).resolve().parents[1] / "public"

VOX_CSS = re.compile(
    r"\n?\s*/\* VOX overlay \*/\s*"
    r"#vox-overlay\{[^}]+\}\s*"
    r"#vox-overlay\.open\{[^}]+\}\s*"
    r"@keyframes voxIn\{[^}]+\}\s*"
    r"#vox-overlay iframe\{[^}]+\}\s*"
    r"#vox-close-btn\{[^}]+\}\s*",
    re.DOTALL,
)

VOX_CSS_COMPACT = re.compile(
    r"\n#vox-overlay\{display:none;position:fixed;bottom:90px;right:24px;[^}]+\}\s*"
    r"#vox-overlay\.open\{[^}]+\}\s*"
    r"@keyframes voxIn\{[^}]+\}\s*"
    r"#vox-overlay iframe\{[^}]+\}\s*"
    r"#vox-close-btn\{[^}]+\}\s*",
    re.DOTALL,
)

OVERLAY = """<div id="vox-overlay" onclick="if(event.target===this)closeVox(true)">
  <button id="vox-close-btn" type="button" onclick="event.stopPropagation();closeVox(true)" aria-label="Close">&#10005;</button>
  <iframe id="vox-iframe" src="about:blank" title="A1 AI Team Member" allow="microphone *" style="display:none;border:none;background:transparent;"></iframe>
</div>"""


def patch(path: Path) -> bool:
    text = path.read_text()
    orig = text
    text = VOX_CSS.sub("", text)
    text = VOX_CSS_COMPACT.sub("", text)
    text = re.sub(
        r'<div id="vox-overlay"[^>]*>.*?</div>\s*(?=<script|</body)',
        OVERLAY + "\n",
        text,
        count=1,
        flags=re.DOTALL,
    )
    if text != orig:
        path.write_text(text)
        return True
    return False


SKIP = {"ai-talk.html", "ai-talk-popup.html", "email-orb-launcher.html", "a1_hero_preview.html", "voice/index.html"}


def main():
    changed = []
    for html in sorted(PUBLIC.glob("*.html")):
        if html.name in SKIP:
            continue
        if patch(html):
            changed.append(html.name)
    print("updated:", ", ".join(changed) if changed else "(none)")


if __name__ == "__main__":
    main()
