# World-Class UX Review Checklist (v1.2)

**Purpose:** reviewer/CEO gate to ensure UI/automation is industry-leading, safe, and operator-friendly.

## Pass/Fail Rule
- **FAIL** if any P0 item fails.
- P1 items may ship only with explicit CEO signoff and a tracked follow-up.

---

## P0 — Operator Safety + Control (must pass)
- [ ] Global kill switch exists, is visible within 1 click from inbox, and is confirmed with reason.
- [ ] Per-thread kill/pause exists (pause thread, DNC thread) and is visible in thread context.
- [ ] DNC is absolute: once set, auto-send cannot send.
- [ ] Auto-send decisions are **server-authoritative** (decide-send gate) and logged.
- [ ] Every outbound action has an audit record (allow/deny + reason codes + settings snapshot/policy version).
- [ ] Clear “dry-run” mode exists for testing.

## P0 — Clarity + Speed (must pass)
- [ ] Inbox tri-pane layout is readable at 1366px+.
- [ ] Primary actions are obvious (Send/Abort/Assign/Pause).
- [ ] Loading/empty/error states are present and helpful on all key screens.
- [ ] No silent failures: automation pause reason is shown.

## P0 — Typing Simulation UX (must pass)
- [ ] Shows countdown / “sending in Xs” preview.
- [ ] Abort button cancels queued send.
- [ ] If lead messages again before send, queued send is cancelled/regenerated.

## P0 — Data Integrity (must pass)
- [ ] Thread ↔ vehicle mapping is visible and editable (remediation).
- [ ] Wrong-vehicle prevention: mapping confidence shown; auto-send blocked below threshold.

## P0 — Craigslist Assisted Autopost (must pass)
- [ ] Explicitly stops before final publish.
- [ ] Validation errors are shown with actionable fixes.

---

## P1 — Accessibility / Polish
- [ ] Keyboard navigable.
- [ ] Contrast meets WCAG AA on primary UI.
- [ ] Tabular numerals used for prices/mileage.

## P1 — Scale Readiness
- [ ] Per-dealer quotas/rate limits enforced.
- [ ] Thundering-herd avoidance for scheduled jobs.

---

## Reviewer Decision
- Decision: PASS / FAIL
- Notes:
- Follow-ups:
