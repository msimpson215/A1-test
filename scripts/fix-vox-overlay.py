#!/usr/bin/env python3
"""Use shared vox-bridge.js: iframe loads on demand, start only after ready."""

from pathlib import Path
import re

PUBLIC = Path(__file__).resolve().parents[1] / "public"

BRIDGE_TAG = '<script src="assets/vox-bridge.js"></script>'

OVERLAY = """<div id="vox-overlay" onclick="if(event.target===this)closeVox()">
  <button id="vox-close-btn" type="button" onclick="closeVox()" aria-label="Close">&#10005;</button>
  <iframe id="vox-iframe" src="about:blank" title="A1 AI Team Member" allow="microphone *" style="display:none;position:fixed;inset:0;width:100%;height:100%;border:none;z-index:10001;"></iframe>
</div>"""


def patch_file(path: Path) -> bool:
    text = path.read_text()
    orig = text

    text = re.sub(r"function openVox\(\)\{[^}]+\}\s*", "", text)
    text = re.sub(r"function closeVox\(\)\{[^}]+\}\s*", "", text)

    text = re.sub(
        r'<div id="vox-overlay"[^>]*>.*?</div>\s*(?=<script|</body)',
        OVERLAY + "\n",
        text,
        count=1,
        flags=re.DOTALL,
    )

    if BRIDGE_TAG not in text:
        text = text.replace("</body>", BRIDGE_TAG + "\n</body>", 1)

    if text != orig:
        path.write_text(text)
        return True
    return False


def main():
    changed = []
    for html in sorted(PUBLIC.glob("*.html")):
        if html.name == "voice/index.html":
            continue
        if patch_file(html):
            changed.append(html.name)
    print("updated:", ", ".join(changed) if changed else "(none)")


if __name__ == "__main__":
    main()
