# Olympic inventory truth closure — 2026-03-30 16:46 PDT

## Fresh evidence
- Live source listing page in managed browser: `https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used`
- Live LotView public API: `https://olympichyundai.lotview.ai/api/vehicles?limit=48`
- DB access blocker when attempting local queries with repo env: `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string`

## Headline result
- Source count: **15 live used VDPs**
- LotView count: **32 active rows**
- Count gap: **+17 rows in LotView vs source**
- Exact missing live VDPs in LotView: **3**
- Exact stale/extraneous LotView VDPs absent from source: **20**
- Exact live price mismatches on matched VDPs: **12 / 12 matched**

## Missing from LotView (live on source, absent from LotView)
1. `https://www.olympichyundaivancouver.com/vehicles/2025/audi/q3/vancouver/bc/69684447/?sale_class=used` — sale price **$47,888**
2. `https://www.olympichyundaivancouver.com/vehicles/2026/nissan/leaf/vancouver/bc/69514072/?sale_class=used` — sale price **$45,888**
3. `https://www.olympichyundaivancouver.com/vehicles/2023/subaru/wrx/vancouver/bc/69370454/?sale_class=used` — sale price **$32,388**

## Stale/extraneous in LotView (active in LotView, absent from live source)
1. id 45 — `.../2018/hyundai/accent/.../69415922/`
2. id 44 — `.../2020/honda/civic-sedan/.../69363422/`
3. id 43 — `.../2020/hyundai/kona-electric/.../69188187/`
4. id 42 — `.../2024/honda/civic-sedan/.../69245100/`
5. id 39 — `.../2025/hyundai/kona/.../65993963/`
6. id 37 — `.../2014/hyundai/elantra-gt/.../69433852/`
7. id 36 — `.../2018/hyundai/kona/.../67936756/`
8. id 34 — `.../2022/kia/soul/.../68904631/`
9. id 33 — `.../2020/hyundai/venue/.../68849687/`
10. id 31 — `.../2022/kia/seltos/.../69023725/`
11. id 30 — `.../2021/hyundai/kona-electric/.../69426805/`
12. id 29 — `.../2024/hyundai/kona/.../69363432/`
13. id 27 — `.../2020/subaru/crosstrek/.../68949631/`
14. id 26 — `.../2017/lexus/nx-200t/.../68120414/`
15. id 24 — `.../2018/toyota/rav4/.../69249194/`
16. id 22 — `.../2019/bmw/5-series/.../69086787/`
17. id 15 — `.../2019/mercedes-benz/c-class/.../68167449/`
18. id 14 — `.../2025/hyundai/kona-electric/.../65698411/`
19. id 13 — `.../2024/hyundai/tucson-plug-in-hybrid/.../69240264/`
20. id 10 — `.../2025/hyundai/tucson-plug-in-hybrid/.../69149758/`

## Price mismatches (LotView price -> live source sale price)
1. id 38 EV6 `.../69299603/`: **$0 -> $51,888**
2. id 6 Acura ZDX `.../67357906/`: **$56,888 -> $49,888**
3. id 8 Santa Fe `.../68980125/`: **$49,388 -> $47,388**
4. id 9 Wrangler 4xe `.../67570155/`: **$47,888 -> $41,888**
5. id 11 Volvo XC60 Recharge `.../68446524/`: **$44,388 -> $40,388**
6. id 12 Honda CR-V Hybrid `.../69240262/`: **$42,388 -> $39,888**
7. id 17 Kona `.../65956907/`: **$36,888 -> $35,388**
8. id 40 Kona `.../64981288/`: **$34,888 -> $33,388**
9. id 19 Kona `.../69240263/`: **$34,888 -> $33,388**
10. id 20 Kona `.../65760579/`: **$33,888 -> $32,388**
11. id 41 Kona `.../68483614/`: **$33,888 -> $32,388**
12. id 23 IONIQ 5 `.../69188186/`: **$32,388 -> $30,888**

## Strongest proven root cause
The scrape/sync state is not merely drifting — it is materially untruthful across every axis checked:
- count truth broken (`32` shown vs `15` live)
- stale cleanup broken (`20` active rows no longer live)
- VDP URL truth broken (`3` live URLs never made it into LotView)
- price truth broken (`12/12` matched URLs priced wrong, one at `0`)

This is not a UI-only issue. The public LotView API is already serving the wrong inventory truth.

## Exact next executable remediation
1. Fix the runtime DB env so local SQL can authenticate (`DATABASE_URL` currently yields SCRAM password-string failure).
2. Execute `runtime/olympic-inventory-remediation-2026-03-30.sql` against the production DB.
3. Immediately run a dealership-1 scrape/import for Olympic to upsert the 3 missing live VDPs.
4. Re-hit:
   - `https://olympichyundai.lotview.ai/api/vehicles?limit=48`
   - `https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used`
5. Closure target after remediation: **15 active rows, 15 live VDP matches, 0 stale extras, 0 missing live VDPs, 0 price mismatches**.
