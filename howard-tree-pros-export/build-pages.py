#!/usr/bin/env python3
"""Generate Howard's Tree Pros HTML pages with shared nav/footer."""

PHONE = "618-477-1523"
PHONE_TEL = "16184771523"
EMAIL = "howardstreepros@gmail.com"
YEAR = "2026"

def header(active=""):
    def cls(page):
        return ' class="active"' if active == page else ""

    return f"""<header class="site-header">
  <a href="index.html" class="logo" aria-label="Howard's Tree Pros home">
    <span class="logo-mark">HTP</span>
    <span class="logo-text">Howard's Tree Pros</span>
  </a>
  <nav class="main-nav" aria-label="Main">
    <a href="index.html"{cls("home")}>Home</a>
    <div class="has-drop">
      <a href="services.html"{cls("services")}>Services</a>
      <ul class="drop">
        <li><a href="tree-trimming.html">Tree Trimming</a></li>
        <li><a href="tree-removal.html">Tree Removal</a></li>
        <li><a href="stump-grinding.html">Stump Grinding</a></li>
        <li><a href="storm-cleanup.html">Storm Cleanup</a></li>
      </ul>
    </div>
    <a href="about.html"{cls("about")}>About Us</a>
    <a href="contact.html"{cls("contact")}>Contact</a>
  </nav>
  <a href="tel:{PHONE_TEL}" class="btn-call-header">
    <span class="btn-label">Call Now</span>
    <span class="btn-phone">{PHONE}</span>
  </a>
</header>"""

def footer():
    return f"""<footer class="site-footer">
  <div class="footer-grid">
    <div class="footer-brand">
      <span class="logo-mark">HTP</span>
      <p>Howard's Tree Pros</p>
    </div>
    <div>
      <h4>Quick Links</h4>
      <a href="index.html">Home</a>
      <a href="services.html">Services</a>
      <a href="about.html">About Us</a>
      <a href="contact.html">Contact</a>
    </div>
    <div>
      <h4>Our Services</h4>
      <a href="tree-trimming.html">Tree Trimming</a>
      <a href="tree-removal.html">Tree Removal</a>
      <a href="stump-grinding.html">Stump Grinding</a>
      <a href="storm-cleanup.html">Storm Cleanup</a>
    </div>
    <div>
      <h4>Contact Us</h4>
      <a href="tel:{PHONE_TEL}">{PHONE}</a>
      <a href="mailto:{EMAIL}">{EMAIL}</a>
      <p>Serving our local area</p>
    </div>
  </div>
  <p class="copyright">© {YEAR} Howard's Tree Pros. All Rights Reserved.</p>
</footer>"""

def page(title, active, body):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title} — Howard's Tree Pros</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
{header(active)}
{body}
{footer()}
</body>
</html>
"""

SERVICE_PAGES = {
    "tree-trimming": {
        "title": "Tree Trimming & Pruning",
        "icon": "🌳",
        "lead": "Healthy trees, safer property, better curb appeal.",
        "body": """
<p>Professional trimming and pruning keeps your trees strong and your yard safe. We remove deadwood, thin crowded canopies, and raise limbs away from roofs, driveways, and power lines.</p>
<h2>What we do</h2>
<ul>
  <li>Crown cleaning and thinning</li>
  <li>Deadwood removal</li>
  <li>Clearance pruning (house, garage, lines)</li>
  <li>Structural pruning for young trees</li>
</ul>
<p>Regular trimming is one of the best ways to avoid emergency removals later. We'll walk the property with you and recommend what actually needs done — no upsell nonsense.</p>
""",
    },
    "tree-removal": {
        "title": "Tree Removal",
        "icon": "🪚",
        "lead": "Safe takedowns for hazardous, dead, or unwanted trees.",
        "body": """
<p>When a tree is dead, dying, storm-damaged, or in the wrong place, removal is the right call. Howard's Tree Pros has the equipment and experience to take trees down safely — tight yards, near structures, and large diameters.</p>
<h2>Common reasons homeowners call</h2>
<ul>
  <li>Storm damage or split trunks</li>
  <li>Disease or insect damage</li>
  <li>Leaning toward house, fence, or driveway</li>
  <li>Construction or landscape plans</li>
  <li>Overgrown trees blocking light or views</li>
</ul>
<p>We rig carefully, protect your lawn and structures where we can, and haul away the wood and brush when we're done.</p>
""",
    },
    "stump-grinding": {
        "title": "Stump Grinding",
        "icon": "🪵",
        "lead": "Remove stumps so you can mow, plant, or build.",
        "body": """
<p>Stumps are tripping hazards and they attract insects. Grinding below grade lets you replant, sod, or pave without fighting old roots.</p>
<h2>Our stump service includes</h2>
<ul>
  <li>Grinding to below ground level</li>
  <li>Wood chip backfill (optional)</li>
  <li>Multiple stumps on one visit</li>
  <li>Access for backyard and fence-line stumps</li>
</ul>
<p>Often scheduled right after a removal — one crew, one trip, job fully finished.</p>
""",
    },
    "storm-cleanup": {
        "title": "Storm Cleanup & Emergency Service",
        "icon": "⚡",
        "lead": "24/7 response when wind and ice bring trees down.",
        "body": """
<p>Storms don't wait. When limbs block your driveway or a tree lands on a shed, you need someone who answers the phone and shows up ready to work.</p>
<h2>Emergency & storm work</h2>
<ul>
  <li>Fallen trees and large limbs</li>
  <li>Hazardous hangers and split trunks</li>
  <li>Debris haul-off and site clearing</li>
  <li>Coordination with insurance photos/documentation</li>
</ul>
<p>Call <a href="tel:{PHONE_TEL}">{PHONE}</a> — we'll get you a straight answer and a realistic timeline.</p>
""",
    },
}

def main():
    from pathlib import Path
    out = Path(__file__).parent

    index = page("Home", "home", """
<section class="hero" id="home">
  <div class="hero-content">
    <p class="hero-tag">41 Years of Experience · Experienced. Skilled. Trusted.</p>
    <h1>Expert Tree Care<br>You Can Trust</h1>
    <p class="hero-lead">Safe. Reliable. Professional.</p>
    <p class="hero-desc">From trimming to removal, we provide top quality tree services with the experience and equipment to get the job done right.</p>
    <a href="tel:{PHONE_TEL}" class="btn-primary">Request a Free Quote</a>
    <a href="services.html" class="btn-secondary" style="margin-left:0.75rem;color:#fff;border-color:#fff;">View Services</a>
  </div>
</section>

<section class="services" id="services">
  <p class="section-label">Our Services</p>
  <h2>Complete Tree Solutions</h2>
  <div class="service-grid">
    <a class="service-card" href="tree-trimming.html">
      <div class="hex" aria-hidden="true">🌳</div>
      <h3>Tree Trimming</h3>
      <p>Improve health, appearance, and safety of your trees.</p>
      <span class="learn">Learn more →</span>
    </a>
    <a class="service-card" href="tree-removal.html">
      <div class="hex" aria-hidden="true">🪚</div>
      <h3>Tree Removal</h3>
      <p>Safe removal of trees of any size.</p>
      <span class="learn">Learn more →</span>
    </a>
    <a class="service-card" href="stump-grinding.html">
      <div class="hex" aria-hidden="true">🪵</div>
      <h3>Stump Grinding</h3>
      <p>Grind stumps below grade — replant or rebuild.</p>
      <span class="learn">Learn more →</span>
    </a>
    <a class="service-card" href="storm-cleanup.html">
      <div class="hex" aria-hidden="true">⚡</div>
      <h3>Storm Cleanup</h3>
      <p>24/7 emergency help when you need it most.</p>
      <span class="learn">Learn more →</span>
    </a>
  </div>
</section>

<section class="why" id="about-preview">
  <div class="why-photo" role="img" aria-label="Tree service crew at work"></div>
  <div class="why-content">
    <p class="section-label light">Why Choose Us</p>
    <h2>41 Years of Experience</h2>
    <p>Howard's Tree Pros brings four decades of hands-on tree work to every job — trimming, removal, grinding, and storm response you can count on.</p>
    <ul>
      <li>41 years serving our community</li>
      <li>Reliable &amp; professional crew</li>
      <li>Free estimates — call Colt</li>
      <li>References available upon request</li>
    </ul>
    <a href="about.html" class="btn-primary" style="align-self:flex-start;margin-top:0.5rem;">About Us</a>
  </div>
</section>

<section class="cta-bar">
  <div class="cta-inner">
    <span class="cta-icon" aria-hidden="true">📞</span>
    <div>
      <h2>Need Tree Service?</h2>
      <a href="tel:{PHONE_TEL}" class="cta-phone">Call {PHONE}</a>
    </div>
    <p class="cta-note">Free Estimates • Fast Response • Proudly Serving Our Local Community</p>
  </div>
</section>
""".format(PHONE=PHONE, PHONE_TEL=PHONE_TEL))

    about = page("About Us", "about", """
<section class="page-hero">
  <h1>About Howard's Tree Pros</h1>
  <p>41 years of experience. Local crew. Honest quotes.</p>
</section>
<div class="page-content">
  <div class="highlight-box">
    <strong>41 years in the tree business</strong>
    <p style="margin:0.5rem 0 0;">That's not a marketing line — it's how long we've been climbing, cutting, and cleaning up for homeowners and businesses in our area.</p>
  </div>
  <p>Howard's Tree Pros is built on showing up, doing safe work, and leaving the property cleaner than we found it. Whether you need a routine trim, a hazardous removal, stumps ground out, or emergency storm help, you get the same crew mindset: do it right the first time.</p>
  <h2>What you can expect</h2>
  <ul>
    <li>Clear communication before we start</li>
    <li>Care around structures, lawns, and driveways</li>
    <li>Proper equipment for the size of the job</li>
    <li>Fair pricing and free phone estimates</li>
  </ul>
  <h2>Call Colt</h2>
  <p>Questions? Ready for a quote? Call <a href="tel:{PHONE_TEL}">{PHONE}</a> or email <a href="mailto:{EMAIL}">{EMAIL}</a>.</p>
</div>
<section class="cta-bar">
  <div class="cta-inner">
    <span class="cta-icon" aria-hidden="true">📞</span>
    <div>
      <h2>Free Estimate</h2>
      <a href="tel:{PHONE_TEL}" class="cta-phone">Call {PHONE}</a>
    </div>
  </div>
</section>
""".format(PHONE=PHONE, PHONE_TEL=PHONE_TEL, EMAIL=EMAIL))

    services = page("Services", "services", """
<section class="page-hero">
  <h1>Our Services</h1>
  <p>Everything a full-service tree company should offer — click any service to learn more.</p>
</section>
<section class="services" style="padding-top:2rem;">
  <div class="service-grid">
    <a class="service-card" href="tree-trimming.html">
      <div class="hex">🌳</div>
      <h3>Tree Trimming &amp; Pruning</h3>
      <p>Health, safety, and clearance from structures and lines.</p>
      <span class="learn">Learn more →</span>
    </a>
    <a class="service-card" href="tree-removal.html">
      <div class="hex">🪚</div>
      <h3>Tree Removal</h3>
      <p>Dead, hazardous, storm-damaged, or unwanted trees.</p>
      <span class="learn">Learn more →</span>
    </a>
    <a class="service-card" href="stump-grinding.html">
      <div class="hex">🪵</div>
      <h3>Stump Grinding</h3>
      <p>Remove stumps for mowing, planting, or construction.</p>
      <span class="learn">Learn more →</span>
    </a>
    <a class="service-card" href="storm-cleanup.html">
      <div class="hex">⚡</div>
      <h3>Storm Cleanup</h3>
      <p>Emergency response — fallen trees and debris.</p>
      <span class="learn">Learn more →</span>
    </a>
  </div>
</section>
<section class="cta-bar">
  <div class="cta-inner">
    <div>
      <h2>Not sure which service you need?</h2>
      <a href="tel:{PHONE_TEL}" class="cta-phone">Call {PHONE}</a>
    </div>
    <p class="cta-note">We'll tell you what we'd do if it were our yard.</p>
  </div>
</section>
""".format(PHONE=PHONE, PHONE_TEL=PHONE_TEL))

    contact = page("Contact", "contact", """
<section class="page-hero">
  <h1>Contact Us</h1>
  <p>Free estimates. Fast response. Call or email anytime.</p>
</section>
<div class="page-content" style="text-align:center;">
  <div class="highlight-box">
    <p style="font-size:1.75rem;font-weight:900;color:var(--navy);margin-bottom:0.25rem;"><a href="tel:{PHONE_TEL}">{PHONE}</a></p>
    <p><a href="mailto:{EMAIL}">{EMAIL}</a></p>
    <p style="margin-top:1rem;">Call <strong>Colt Howard</strong> for a free quote on trimming, removal, grinding, or storm work.</p>
  </div>
  <p>Serving our local area and surrounding communities.</p>
  <a href="tel:{PHONE_TEL}" class="btn-primary">Call Now</a>
</div>
""".format(PHONE=PHONE, PHONE_TEL=PHONE_TEL, EMAIL=EMAIL))

    pages = {
        "index.html": index,
        "about.html": about,
        "services.html": services,
        "contact.html": contact,
    }

    for slug, data in SERVICE_PAGES.items():
        fname = f"{slug}.html"
        inner = data["body"].format(PHONE=PHONE, PHONE_TEL=PHONE_TEL)
        pages[fname] = page(data["title"], slug.replace("-", "_")[:20], f"""
<section class="page-hero">
  <h1>{data["title"]}</h1>
  <p>{data["lead"]}</p>
</section>
<div class="page-content">
{inner}
  <a href="tel:{PHONE_TEL}" class="btn-primary">Get a Free Quote</a>
  <a href="services.html" class="btn-secondary">All Services</a>
</div>
<section class="cta-bar">
  <div class="cta-inner">
    <div>
      <h2>Ready to schedule?</h2>
      <a href="tel:{PHONE_TEL}" class="cta-phone">Call {PHONE}</a>
    </div>
  </div>
</section>
""".format(PHONE=PHONE, PHONE_TEL=PHONE_TEL))

    for name, html in pages.items():
        (out / name).write_text(html, encoding="utf-8")
        print("wrote", name)

if __name__ == "__main__":
    main()
