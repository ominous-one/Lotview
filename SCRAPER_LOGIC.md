# Scraper Logic Rules

> **MANDATORY**: The scraper must follow these rules on EVERY run.

---

## 1. DEDUPLICATION RULES (HARD ENFORCEMENT)

### Before Creating Any Record:
1. **Check for existing VDP URL** - Query database for `dealer_vdp_url` match before inserting
2. **Check for existing VIN** - If VIN is known, upsert by VIN, never create duplicate
3. **No PENDING placeholders for existing URLs** - If a record exists for this VDP URL, skip placeholder creation

### After Successful Import:
1. **Clean up PENDING records** - Delete any `PENDING-*` VIN records with same `dealer_vdp_url`
2. **Log cleanup actions** - Record how many PENDING records were removed

---

## 2. SMART MERGE RULES (DATA PRESERVATION)

> **CRITICAL**: Never overwrite good data with empty/zero values from failed scrapes.

### Price Preservation:
- **New price > 0**: Update to new price
- **New price = 0 or null**: KEEP existing price (Cloudflare likely blocked VDP)

### Odometer Preservation:
- **New odometer > 0**: Update to new odometer
- **New odometer = 0 or null**: KEEP existing odometer

### Image Preservation:
- **New images found**: Update to new images
- **No images scraped**: KEEP existing images

### Other Fields Preservation:
- **VIN, trim, colors, transmission, fuel type, drivetrain**: Only update if new value is non-empty
- **Description, VDP content, tech specs**: Only update if new value is non-empty
- **Carfax URL, stock number**: Only update if new value is non-empty

### Fields Always Updated (Core Identity):
- **Year, Make, Model, DealershipId**: Always taken from new scrape (these define vehicle identity)
- Upsert matches by VIN, so these should match; if different VIN, creates new record

### Why Smart Merge?
1. Cloudflare often blocks VDP pages mid-scrape
2. Partial data (price=0, no images) would destroy good records
3. Better to keep existing data than overwrite with gaps
4. Price changes are captured when VDP is accessible

---

## 2.5. VDP SCRAPING OPTIMIZATION

### Skip Re-Scraping Complete Vehicles:
- **12+ images**: Skip VDP scraping entirely (vehicle is complete)
- **Reasoning**: Reduces API costs, avoids unnecessary Cloudflare blocks
- **Price updates**: Handled separately when manager clicks "Force Re-scrape"

### Force Re-Scrape (Manager Override):
- **Who can use**: General Manager, Sales Manager roles only
- **When to use**: Price changed, images need updating, data looks stale
- **Behavior**: Ignores 12+ image rule, performs full VDP scrape
- **Access**: Button on individual vehicle cards in admin/manager views

---

## 3. VALIDATION RULES

### Hard Rejections (Vehicle NOT saved):
| Field | Rule | Example Valid | Example Invalid |
|-------|------|---------------|-----------------|
| Year | 1990 - (current year + 2) | 2024 | 1985, 2030 |
| Make | 2+ characters, real brand name | "Hyundai" | "V", "Vehicle", "" |
| Model | 1+ characters | "Kona" | "" |

### Placeholder VIN Conventions (Allowed):
| Prefix | Meaning | When Used |
|--------|---------|-----------|
| `PENDING-` | VDP blocked, awaiting retry | Cloudflare blocked VDP page |
| `ZENROWS-` | ZenRows extraction failed | ZenRows couldn't parse VIN |
| `SCRAPINGBEE-` | ScrapingBee extraction failed | ScrapingBee couldn't parse VIN |
| 17-char alphanumeric | Real VIN | Successful extraction |

### Soft Warnings (Vehicle saved but flagged for review):
| Field | Condition | Action |
|-------|-----------|--------|
| Price | $0 or null | **WARN** - Allow for pending enrichment |
| Price | < $5,000 or > $500,000 | **WARN** - Flag for manual review |
| Odometer | Null or negative | **WARN** - Allow for pending enrichment |
| Odometer | > 500,000 km | **WARN** - Flag for manual review |
| Images | 0 valid photos | **WARN** - Allow, may scrape later |

### Why Soft Warnings?
- Cloudflare often blocks VDP pages, preventing complete data extraction
- Better to have partial record than no record
- Nightly sync will retry and enrich missing data
- Manual cleanup handles persistent gaps

---

## 3. DATA EXTRACTION PRIORITY

### VDP Page Extraction Order:
1. **Hidden inputs first**: `vdp-price`, `vdp-odometer`, `vdp-vin` fields
2. **Structured data second**: JSON-LD, microdata
3. **Pattern matching third**: Regex on visible text (last resort)

### If Cloudflare Blocks VDP:
1. Extract basic info from SRP (year, make, model, VDP URL)
2. Create PENDING placeholder ONLY if no record exists for that VDP URL
3. Retry VDP scraping on next run
4. After 3 failed attempts, log for manual review

---

## 4. RECORD LIFECYCLE

```
SRP Scrape → VDP URL Found → Check Existing Record
                                    ↓
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
            Record Exists                    No Record
                    ↓                               ↓
            Update existing              Scrape VDP for data
                                                    ↓
                                    ┌───────────────┴───────────────┐
                                    ↓                               ↓
                            VDP Success                      VDP Blocked
                                    ↓                               ↓
                            Create full record           Create PENDING placeholder
                            with real VIN                (ONLY if no existing URL)
```

---

## 5. GARBAGE DATA PREVENTION

### Immediate Rejection Criteria (Hard Reject):
- [ ] Make equals "Vehicle", "Car", "Auto", or generic terms
- [ ] Make is less than 2 characters
- [ ] Model is empty
- [ ] Year outside 1990 - (current year + 2) range

### Warning Criteria (Save but Flag):
- [ ] Model equals Make (duplicate text)
- [ ] Year is current year but odometer > 50,000
- [ ] Price is exactly $0 (pending enrichment)
- [ ] No images extracted (may scrape later)

### Auto-Cleanup Triggers:
- PENDING record has matching real VIN imported → **DELETE PENDING immediately**
- Duplicate VDP URLs detected → Keep record with real VIN, delete placeholder
- Manual cleanup for records with $0 price after 7 days

---

## 6. NIGHTLY SYNC EXPECTATIONS

### Success Criteria:
- [ ] 0 duplicate records created
- [ ] 0 garbage "Vehicle" or empty make records
- [ ] All real vehicles have: valid VIN, price > 0, odometer ≥ 0
- [ ] PENDING count stable or decreasing
- [ ] Record count matches live website ±5%

### Failure Response:
1. Log detailed error with vehicle data attempted
2. Skip problematic vehicle, continue with others
3. Report summary: imported, updated, rejected, reasons

---

## 7. CPO BADGE RULES

### Certified Pre-Owned Badge Criteria:
- Make: Hyundai only
- Year: 2022 or newer
- Odometer: < 80,000 km
- Odometer must be KNOWN (not null, not PENDING)

```
IF make == "Hyundai" 
   AND year >= 2022 
   AND odometer < 80000 
   AND odometer IS NOT NULL
THEN apply CPO badge
ELSE no badge
```

---

## 8. LOGGING REQUIREMENTS

### Every Scrape Run Must Log:
```
[Scrape Start] Source: {url}, Method: {zenrows|scrapingbee}
[SRP Result] Found: {count} vehicle links
[VDP Attempt] URL: {vdp_url}, Status: {success|blocked|error}
[Import] VIN: {vin}, Action: {created|updated|rejected}, Reason: {reason}
[Cleanup] Deleted {count} PENDING records
[Scrape Complete] Created: {n}, Updated: {n}, Rejected: {n}, Duration: {ms}
```

---

## 9. ERROR HANDLING

### Cloudflare/Anti-Bot Detection:
1. First attempt: ZenRows with JS rendering
2. Fallback: ScrapingBee with stealth mode
3. If both fail: Create PENDING placeholder (if no existing record)
4. Never retry immediately - wait for next scheduled run

### Network/Timeout Errors:
- Retry up to 3 times with exponential backoff
- After 3 failures, skip vehicle and log error
- Never crash entire scrape for single vehicle failure

---

## 10. SCRAPER HEALTH CHECKS

### Pre-Run Validation:
- [ ] API keys present (ZENROWS_API_KEY, SCRAPINGBEE_API_KEY)
- [ ] Database connection active
- [ ] Source URL is reachable

### Post-Run Validation:
- [ ] No duplicate VINs created
- [ ] No duplicate VDP URLs created
- [ ] PENDING count reported
- [ ] Total vehicle count logged

---

*Last Updated: January 2026*
*Version: 1.1 - Updated validation rules to reflect actual code behavior (warnings vs rejections)*
