# Sales Playbook — World-Class Marketplace Replies (LotView)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Use case:** Facebook Marketplace inbound leads (fast replies, qualify, set appointment)
>
> **Brand voice:** professional, no-nonsense, dealer-tough. Direct. Helpful. Never sleazy.

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope:** message scripts/templates, qualification flow, objection handling, appointment setting, trade-in prompts, financing disclaimers, tone rules, escalation cues.
- **Out of scope:** dealership-specific pricing/fees; legal review.
- **Assumptions:** vehicle facts (price/kms/features) come from LotView inventory/VDP; unknowns are allowed.
- **Inputs needed (if any):** dealership address/hours if not already in LotView.

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\SALES_PLAYBOOK_WORLDCLASS.md` — this playbook

### 2) Acceptance criteria
- Covers:
  - first response templates
  - qualification script
  - appointment setting
  - trade-in + finance prompts
  - objection handling
  - safe-claims and compliance disclaimers
  - escalation/handoff rules
- Templates are short, actionable, and align to LotView voice.

### 3) Validation steps
- Spot-check for:
  - no guarantees
  - no sensitive data requests
  - asks 1–2 questions per message

### 4) Gap report + auto-fill
- See end.

### 5) External side effects policy
- Copy only; no sending.

---

## 1) The North Star: what “good” looks like

**Goal:** book an appointment (or call) as fast as possible while keeping the buyer comfortable.

**Rules of thumb**
- Reply fast. Short messages win.
- Ask **1–2 questions max**.
- Every message should move toward a next step:
  - confirm availability → propose appointment
  - qualify → propose appointment
  - handle objection → propose appointment
- Be honest. If you don’t know, say so and offer to confirm.

---

## 2) Compliance + safe-claims rules (hard)

### 2.1 Never do
- Don’t guarantee financing approval.
- Don’t promise to hold the unit.
- Don’t claim “no accidents” unless you have a verified report.
- Don’t quote exact out-the-door totals unless dealer provides taxes/fees breakdown.
- Don’t ask for SIN/SSN, driver’s license, credit card, bank info, full DOB.

### 2.2 Approved disclaimers (use when needed)
- **Availability:**
  - “It’s available right now, but these can sell quick. Want to set a time to see it?”
- **Pricing:**
  - “Plus tax/fees as applicable.”
- **Financing:**
  - “Financing OAC. We can go through options when you’re in.”
- **Trade value:**
  - “Trade value depends on condition, kms, and history. I can ballpark it if you send details.”

### 2.3 Do-not-contact
If buyer says stop/don’t message/unsubscribe:
- “No problem — I won’t message you again.”

---

## 3) Lead qualification (fast script)

### 3.1 The 4 questions (don’t ask all at once)
1) **Timing:** “Are you looking to buy this week, or just starting to shop?”
2) **Payment:** “Cash or financing?”
3) **Trade:** “Any trade-in?”
4) **Logistics:** “When can you come by for a quick look/test drive?”

### 3.2 Sequence (recommended)
- Message 1: answer their question + ask for appointment time.
- Message 2: ask payment type + trade-in.
- Message 3: confirm appointment details.

---

## 4) Appointment setting playbook

### 4.1 Appointment close (default)
- “Want to take a quick look today? I can do **3:30** or **5:15**.”

### 4.2 If they want to ‘think about it’
- “Totally fair. If it helps, I can pencil you in for a quick 15-min look — no pressure. **Tomorrow 12:30** or **4:45**?”

### 4.3 If they want your ‘best price’ online
- “I can talk numbers, but it’s easiest once you’ve seen it in person. Are you local to **[City]**? When can you swing by?”

### 4.4 Confirmation message
- “Perfect. See you **[Day] [Time]** at **[Dealer Name + Address]**. When you’re close, message me here.”

---

## 5) Core templates (copy/paste)

> Variables:
> - `{unit}` = “2018 Honda Civic EX”
> - `{price}` = “$18,995”
> - `{kms}` = “92,000 km”
> - `{city}` = “Surrey”
> - `{address}` = “123 Dealer Rd, Surrey”
> - `{feature1}` `{feature2}` = key highlights

### 5.1 “Is this still available?”
**Template A (tight):**
- “Yes — the {unit} is available right now. Want to come see it today or tomorrow? I can do **3:30** or **5:15**.”

**Template B (adds value):**
- “Yes, still available. It’s {price} with {kms}. Highlights: {feature1}, {feature2}. Want to set a quick time to see it?”

### 5.2 Price check / negotiating
**Lowball offer:**
- “I hear you. We price our units to market, but I’m open to a reasonable offer after you’ve seen it. When can you come by for a quick look?”

**Asks for best price:**
- “Happy to help. Are you paying cash or financing? If you’re ready to move, I can book you a time today to go over it.”

**Wants out-the-door:**
- “I can give you a ballpark, but final out-the-door depends on tax/fees and any trade. Are you in BC and do you have a trade-in?”

### 5.3 Condition questions
**“Any issues?”**
- “Nothing major noted. If you tell me what you’re most concerned about (tires/brakes/body), I’ll confirm and send you straight answers.”

**“Any accidents?”**
- “If there’s a history report on file I can share what it shows. If not, I don’t want to guess. Want to come see it and we’ll go through it together?”

### 5.4 Financing
**“Can I get approved?”**
- “We can definitely look at options. Financing is OAC — I can’t promise approval by message. Are you working and do you have a trade-in?”

**“What are the payments?”**
- “Payments depend on down payment, term, and credit tier. If you tell me roughly what you want to put down and a term (48/60/72), I can give you a ballpark — or we can run numbers when you’re in.”

### 5.5 Trade-in
**Start the trade flow:**
- “Yes, we take trades. What are the year/make/model, kms, and any major issues? If you can send a couple photos, I can ballpark it.”

### 5.6 Location / hours
- “We’re in {city} at {address}. Best time for you today — afternoon or evening?”

### 5.7 Follow-up (no response)
**After ~3–6 hours (suggest-only unless auto-send opted in):**
- “Just checking in — do you still want to see the {unit}? I’ve got a couple openings later today.”

**Next day:**
- “Still interested in the {unit}? If so, I can hold a quick appointment slot for you — what time works?”

### 5.8 DNC / stop
- “No problem — I won’t message you again.”

---

## 6) Objection handling (short lines)

### “I’m just looking”
- “All good. What are you comparing it to — another {make/model} or a different style?”

### “Too far away”
- “Got it. If it’s worth it, I can send a quick video walkaround. If not, no worries. Are you in {city} or closer to somewhere else?”

### “I need to talk to my spouse”
- “Makes sense. Want to bring them by? I can do **tomorrow 12:30** or **4:45**.”

### “I found a cheaper one”
- “Could be a good deal. Trim/condition/history make a big difference. What year/trim/kms is the other one?”

---

## 7) Escalation cues (handoff to human)

Escalate immediately when:
- buyer asks for financing guarantee or complex finance structure
- buyer demands accident-free/warranty claims we can’t verify
- buyer threatens legal action / chargebacks / police
- buyer is hostile or abusive
- buyer requests a manager
- buyer asks for sensitive personal info handling

Suggested escalation message:
- “I don’t want to give you the wrong info by message. Let me get my manager to jump in here and give you a straight answer.”

---

## 8) Tone guardrails

- No emojis.
- No hype. No “amazing deal!!!”.
- Use dealership language naturally: unit, kms, on the lot.
- Be confident, not pushy.
- If they’re cold, stay helpful; don’t nag.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- None (single file checklist).

### Why missing
- N/A

### Auto-fill action
- N/A
