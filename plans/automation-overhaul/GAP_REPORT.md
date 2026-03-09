# LotView Automation Overhaul — Gap Report (Auto-fill)

## Missing items (from this architect package)
None. All planned architect deliverables for v0 were written.

## Blocking unknowns / questions (minimal set)
These are the only items that block finalizing implementation details (not the overall architecture):

1) **Craigslist launch scope**
- Which Craigslist domains/regions are required at launch? (e.g., `vancouver.craigslist.org`, `seattle.craigslist.org`)
- Are postings always “dealer” postings (vs. private party)?
- What category flow is used consistently (cars+trucks by dealer, etc.)?

2) **Competitive report parameters**
- Default radius: 25/50/100 miles?
- Primary marketplaces to cover (priority order): AutoTrader, Cars.com, CarGurus, Craigslist, dealer sites?
- Canada vs US: which markets are first?

3) **VIN decode + comps constraints**
- Budget range for VIN decode API + market comps data.
- Must-have fields: exact trim/options/packages vs. core mechanical + body + drivetrain.

## Why these are blocking
- Craigslist automation depends on step flow differences (domain, categories, “dealer” vs “owner”) and localized UI.
- Competitive report usefulness depends on sources and radius; otherwise metrics may be misleading.
- VIN decoder vendor choice depends on budget and required fidelity.

## Auto-fill action
Until answered, proceed with safe defaults:
- Craigslist: assisted mode only; stop at preview; support 1–2 domains as configurable patterns.
- Competitive report: default radius 50 miles; API-first approach; generate CSV export.
- VIN decode: implement NHTSA vPIC fallback immediately; treat commercial decoder as pluggable.
