#!/usr/bin/env python3
"""Fix mobile hamburger AI links and nav consistency across all landing pages."""
import re
from pathlib import Path

ROOT = Path('public')

STANDARD_MOBILE = """<div class="mobile-menu" id="mobileMenu">
  <a href="INDEX#services">Services</a>
  <a href="ai-estimator.html">AI Estimator</a>
  <a href="sealcoating.html">Sealcoating</a>
  <a href="crack-filling.html">Crack Filling</a>
  <a href="parking-lot-striping.html">Parking Lot Striping</a>
  <a href="asphalt-patching.html">Asphalt Paving / Sealing</a>
  <a href="concrete-work.html">Concrete Finishing</a>
  <a href="bollard-installation.html">Bollards / Signage</a>
  <a href="our-work.html">Our Work</a>
  <a href="about.html">About</a>
  <a href="#" data-vox-open>Artificial Intelligence Team Member</a>
  <a href="tel:13149495660">(314) 949-5660</a>
  <a href="sms:13149495660" title="Text a real person — not a chatbot">Text Us</a>
</div>"""

MENU_RE = re.compile(
    r'<div class="mobile-menu" id="mobileMenu">[\s\S]*?</div>',
    re.MULTILINE,
)


def normalize_triggers(text: str) -> str:
    text = re.sub(
        r'<a href="javascript:void\(0\)" onclick="openVox\(\)" class="ai-nav">',
        '<a href="#" data-vox-open class="ai-nav">',
        text,
    )
    text = re.sub(
        r'<a href="javascript:void\(0\)" onclick="openVox\(\)"([^>]*)>',
        r'<a href="#" data-vox-open\1>',
        text,
    )
    text = re.sub(
        r'<a href="javascript:void\(0\)" onclick="openVox\(\)" class="ai-orb" id="aiOrb"',
        '<a href="#" data-vox-open class="ai-orb" id="aiOrb"',
        text,
    )
    text = re.sub(
        r'<a href="/voice/"[^>]*>Talk with Our A\.I\. Team Member</a>',
        '<a href="#" data-vox-open>Artificial Intelligence Team Member</a>',
        text,
    )
    return text


def replace_mobile_menus(text: str, index_services: str) -> str:
    block = STANDARD_MOBILE.replace('INDEX#services', index_services)
    matches = list(MENU_RE.finditer(text))
    if not matches:
        return text
    start = matches[0].start()
    end = matches[-1].end()
    return text[:start] + block + text[end:]


def process(path: Path) -> bool:
    if path.name in {'ai-talk.html', 'ai-talk-popup.html', 'email-orb-launcher.html', 'a1_hero_preview.html'}:
        return False

    text = path.read_text(encoding='utf-8')
    original = text

    if 'id="mobileMenu"' not in text and 'site-header' not in text:
        return False

    text = normalize_triggers(text)

    if 'id="mobileMenu"' in text:
        services_href = '#services' if path.name == 'index.html' else 'index.html#services'
        text = replace_mobile_menus(text, services_href)

    if original != text:
        path.write_text(text, encoding='utf-8')
        return True
    return False


def main():
    changed = []
    for html in sorted(ROOT.glob('*.html')):
        if process(html):
            changed.append(html.name)
    print('Updated:', ', '.join(changed) if changed else '(none)')


if __name__ == '__main__':
    main()
