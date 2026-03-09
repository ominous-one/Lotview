# Design Parity Gate (v1.2)

**Goal:** prevent “implemented UI drifts from design pack” and ensure industry-leading polish.

## Inputs
- Design pack (canonical): `plans/automation-overhaul/design/v1_2/`
- Design parity report: `design/automation-overhaul/DESIGN_PARITY_REPORT.md`

## Pass/Fail Criteria
### P0 (must pass)
- [ ] FB Inbox includes:
  - Suggested Reply Card (+ “Why” drilldown)
  - Typing Simulation Preview strip (+ Abort)
  - Audit Trail snippet in context panel
  - Global kill switch + per-thread pause/DNC
- [ ] Automation Settings includes:
  - kill switch confirmation + reason + last action visibility
- [ ] Competitive Report UI uses standard table/filters patterns and shows required fields consistently.
- [ ] Loading/empty/error states exist and match the design intent.

### P1
- [ ] Consistent spacing/type tokens applied.
- [ ] Semantic badges and alerts match component specs.

## Evidence required
- Screenshots (or Playwright screenshots) attached/linked for each key screen.
- List of known deviations with rationale.

## Decision
- PASS / FAIL
- Notes:
