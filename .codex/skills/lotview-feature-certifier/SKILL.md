---
name: lotview-feature-certifier
description: Enforce Lotview feature certification so no feature is treated as working without proof.
---

# Lotview Feature Certifier

Mission: Keep config/feature-registry.json and docs/FEATURE_CERTIFICATION.md honest.

A feature is production-ready only when it has CI proof, automated tests, staging proof, observability proof, real user-flow proof, and rollback proof.

Actions:
- Audit config/feature-registry.json.
- Audit docs/FEATURE_CERTIFICATION.md.
- Downgrade unproven features.
- Mark incomplete features as disabled, staging_only, or fail_closed.
- Make production gates fail when registry claims exceed proof.

Never:
- Never mark production_ready unless every proof field is true.
- Never expose fail_closed features as production.
- Never leave an exposed feature unregistered.
