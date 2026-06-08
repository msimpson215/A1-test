#!/usr/bin/env python3
"""One-click voice overlay: open iframe immediately, single start/stop via postMessage."""

from pathlib import Path
import re

PUBLIC = Path(__file__).resolve().parents[1] / "public"

OPEN_VOX = """function openVox(){var o=document.getElementById('vox-overlay');if(!o)return;o.classList.add('open');o.style.display=o.style.display==='flex'?'flex':'block';var f=document.getElementById('vox-iframe')||o.querySelector('iframe');if(f){f.style.display='block';try{f.contentWindow.postMessage({type:'voxtalk-start'},'*');}catch(e){}}}"""

CLOSE_VOX = """function closeVox(){var f=document.getElementById('vox-iframe')||document.querySelector('#vox-overlay iframe');if(f){try{f.contentWindow.postMessage({type:'voxtalk-stop'},'*');}catch(e){}}var o=document.getElementById('vox-overlay');if(o){o.style.display='none';o.classList.remove('open');}}"""

OVERLAY_SIMPLE = """<div id="vox-overlay" onclick="if(event.target===this)closeVox()">
  <button id="vox-close-btn" type="button" onclick="closeVox()" aria-label="Close">&#10005;</button>
  <iframe id="vox-iframe" src="/voice/" title="A1 AI Team Member" allow="microphone *" style="display:none;position:fixed;inset:0;width:100%;height:100%;border:none;z-index:10001;"></iframe>
</div>"""


def patch_file(path: Path) -> bool:
    text = path.read_text()
    orig = text

    text = re.sub(
        r"function openVox\(\)\{[^}]+\}",
        OPEN_VOX,
        text,
        count=1,
    )
    text = re.sub(
        r"function closeVox\(\)\{[^}]+\}",
        CLOSE_VOX,
        text,
        count=1,
    )

    # index.html-style overlay with fake orb / click to start
    text = re.sub(
        r'<div id="vox-overlay"[^>]*>.*?</div>\s*(?=<script|</body)',
        OVERLAY_SIMPLE + "\n",
        text,
        count=1,
        flags=re.DOTALL,
    )

    # about/contact style minimal overlay (no id on iframe)
    text = re.sub(
        r'<div id="vox-overlay">\s*<button id="vox-close-btn"[^>]*>.*?</button>\s*<iframe[^>]*></iframe>\s*</div>',
        OVERLAY_SIMPLE,
        text,
        count=1,
        flags=re.DOTALL,
    )

    if text != orig:
        path.write_text(text)
        return True
    return False


def main():
    changed = []
    for html in sorted(PUBLIC.glob("*.html")):
        if patch_file(html):
            changed.append(html.name)
    print("updated:", ", ".join(changed) if changed else "(none)")


if __name__ == "__main__":
    main()
