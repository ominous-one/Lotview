# Lotview Feature Registry

The machine-readable registry lives at `config/feature-registry.json`.

## Rule

No feature counts as working because code exists.

A feature only counts as production-ready when it has:

- CI proof
- Automated tests
- Staging proof
- Observability/logging proof
- Real user-flow proof
- Rollback/recovery proof

## Exposure Levels

| Exposure | Meaning |
|---|---|
| `disabled` | Hidden or blocked. Not available to users. |
| `staging_only` | Can be tested in staging. Not a production feature. |
| `production` | Visible or usable in production. Must have at least CI and automated tests. |

## Status Levels

| Status | Meaning |
|---|---|
| `not_started` | No usable implementation. |
| `code_exists` | Code exists but is not proven. |
| `fail_closed` | Code compiles but intentionally blocks execution until certification. |
| `ci_verified` | CI and automated tests exist. |
| `staging_verified` | Staging proof exists. |
| `production_ready` | Full proof exists. |

## Production Gate

`npm run production:gates` validates that:

- The feature registry exists.
- Feature IDs are unique.
- Feature owners and notes are present.
- Registered paths exist.
- Production-exposed features have CI and automated tests.
- `production_ready` features have all proof fields true.
- `fail_closed` features are not exposed as production features.

## Updating the Registry

When changing a feature:

1. Update `config/feature-registry.json`.
2. Add or update tests.
3. Add staging proof once the user flow is verified.
4. Update `docs/FEATURE_CERTIFICATION.md` with commit SHA and proof notes.
5. Run `npm run production:gates`.

## Launch Rule

If a feature is not in the registry, it is not launchable.
If a feature is in the registry but not proven, it must be disabled or staging-only.
