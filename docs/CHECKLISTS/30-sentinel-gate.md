# Gate: Sentinel (security approval)

Audit coverage:
- [ ] Threat model written/updated (even if brief)
- [ ] Authn/authz reviewed (where applicable)
- [ ] Injection surfaces checked (SQL/NoSQL, prompt injection, XSS, SSRF)
- [ ] Rate limiting / abuse cases considered
- [ ] Secrets handling verified (no keys in logs/client)
- [ ] Dependency risks noted (high/critical CVEs)

Outcome:
- [ ] Findings categorized (Critical/High/Med/Low)
- [ ] Critical/High items are fixed or explicitly blocked (with owner)
- [ ] `docs/STATUS.md` updated

Handoff:
- [ ] `docs/HANDOFFS/sentinel-to-engineer.md` if fixes required
- [ ] Otherwise `docs/HANDOFFS/engineer-to-executioner.md` can proceed

