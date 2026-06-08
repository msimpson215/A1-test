#!/usr/bin/env python3
"""Replace per-page mini nav with index-style site header on all public HTML pages."""

from pathlib import Path
import re

PUBLIC = Path(__file__).resolve().parents[1] / "public"
SKIP = {"index.html", "a1_hero_preview.html"}

HEADER = """<header class="site-header">
  <a href="index.html" class="nav-brand" aria-label="A1 Professional Asphalt home">
    <img src="A1__asphalt_logo.jpeg" alt="A1 Professional Asphalt &amp; Sealing LLC" />
  </a>

  <button class="hamburger" onclick="toggleMenu(event)" aria-label="Open menu">
    <span></span><span></span><span></span>
  </button>

  <nav class="desktop-nav" aria-label="Main navigation">
    <div class="has-drop">
      <a href="index.html#services">Services</a>
      <ul class="drop">
        <li><a href="ai-estimator.html">AI Estimator</a></li>
        <li><a href="sealcoating.html">Sealcoating</a></li>
        <li><a href="crack-filling.html">Crack Filling</a></li>
        <li><a href="parking-lot-striping.html">Parking Lot Striping</a></li>
        <li><a href="asphalt-patching.html">Asphalt Patching</a></li>
        <li><a href="concrete-work.html">Concrete Work</a></li>
        <li><a href="bollard-installation.html">Bollard Installation</a></li>
        <li><a href="ada-compliance.html">ADA Compliance</a></li>
      </ul>
    </div>
    <a href="our-work.html">Our Work</a>
    <a href="about.html">About</a>
  </nav>

  <div class="nav-actions">
    <a href="ai-talk.html" class="ai-nav">Artificial Intelligence Team Member</a>
    <a href="tel:13149495660" class="phone-nav">(314) 949-5660</a>
  </div>
</header>
<div class="nav-stripe" aria-hidden="true"></div>

<div class="mobile-menu" id="mobileMenu">
  <a href="index.html#services">Services</a>
  <a href="sealcoating.html">Sealcoating</a>
  <a href="crack-filling.html">Crack Filling</a>
  <a href="parking-lot-striping.html">Parking Lot Striping</a>
  <a href="asphalt-patching.html">Asphalt Patching</a>
  <a href="our-work.html">Our Work</a>
  <a href="about.html">About</a>
  <a href="ai-talk.html">Artificial Intelligence Team Member</a>
  <a href="tel:13149495660">(314) 949-5660</a>
</div>
"""

NAV_LINK = '<link rel="stylesheet" href="assets/site-nav.css" />'

TOGGLE_SCRIPT = """
<script>
function toggleMenu(e){
  if(e) e.stopPropagation();
  document.getElementById('mobileMenu').classList.toggle('open');
}
document.addEventListener('click', function(e){
  var menu = document.getElementById('mobileMenu');
  var button = document.querySelector('.hamburger');
  if(menu && button && !menu.contains(e.target) && !button.contains(e.target)) menu.classList.remove('open');
});
</script>"""

# Remove old inline nav rules (common patterns across service pages)
NAV_CSS_PATTERNS = [
    r"nav\{[^}]+\}\n?",
    r"\.logo img\{[^}]+\}\n?",
    r"\.nav-center\{[^}]+\}\n?",
    r"\.nav-center a\{[^}]+\}\n?",
    r"\.nav-right\{[^}]+\}\n?",
    r"\.back\{[^}]+\}\n?",
    r"\.back:hover\{[^}]+\}\n?",
    r"\.btn-ai\{[^}]+\}\n?",
    r"\.btn-ai:hover\{[^}]+\}\n?",
    r"\.phone-link\{[^}]+\}\n?",
    r"\.phone-link:hover\{[^}]+\}\n?",
    r"\.has-drop\{[^}]+\}\n?",
    r"\.has-drop>a::after\{[^}]+\}\n?",
    r"\.drop\{[^}]+\}\n?",
    r"\.drop li\{[^}]+\}\n?",
    r"\.drop li a\{[^}]+\}\n?",
    r"\.drop li a:hover\{[^}]+\}\n?",
    r"\.has-drop:hover \.drop\{[^}]+\}\n?",
]


def process_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8")
    orig = text

    if "<header class=\"site-header\">" in text:
        return False

    # Replace <nav>...</nav>
    text, n = re.subn(r"<nav>.*?</nav>\s*", HEADER + "\n", text, count=1, flags=re.DOTALL)
    if n == 0:
        print(f"  skip (no nav): {path.name}")
        return False

    # body class for layout hooks
    text = text.replace("<body>", '<body class="has-site-nav">', 1)

    # Add shared nav CSS after fonts
    if NAV_LINK not in text:
        text = re.sub(
            r"(<link[^>]+fonts\.googleapis\.com[^>]+>\s*)",
            r"\1" + NAV_LINK + "\n",
            text,
            count=1,
        )

    # Strip duplicate nav CSS inside <style>
    for pat in NAV_CSS_PATTERNS:
        text = re.sub(pat, "", text)

    # Hero margin: old pages used margin-top:72px for fixed mini-nav
    text = re.sub(
        r"(\.hero\{[^}]*?)margin-top:\s*72px;?",
        r"\1",
        text,
    )

    # toggleMenu script
    if "function toggleMenu" not in text:
        text = text.replace("</body>", TOGGLE_SCRIPT + "\n</body>", 1)

    if text != orig:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main():
    updated = []
    for html in sorted(PUBLIC.glob("*.html")):
        if html.name in SKIP:
            continue
        if process_file(html):
            updated.append(html.name)
    print("Updated:", ", ".join(updated) or "(none)")


if __name__ == "__main__":
    main()
