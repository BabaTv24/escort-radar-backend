# BCU 043/044 Staging Dry-Run Runbook

This runbook is for validating `043_bcu_authoritative_wallet.sql` and `044_bcu_products_and_entitlements.sql` before any production rollout.

Do not call the current production Supabase project "staging". If no separate Supabase staging project exists, use Variant B only after manual approval, with `BCU_WALLET_ENABLED=false`.

## Current Environment Finding

The repo exposes generic Supabase env names only:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `BCU_WALLET_ENABLED`
- `VITE_BCU_WALLET_ENABLED`

No separate staging Supabase project placeholder was detected in repo config. Treat the existing Supabase project as production unless you create a distinct staging project.

## Execution Package Order

1. `scripts/sql/bcu_043_044_preflight_readonly.sql`
2. `supabase/migrations/043_bcu_authoritative_wallet.sql`
3. `scripts/sql/bcu_043_044_post_migration_verify_readonly.sql` blocks `VERIFY 01` through `VERIFY 05`, plus `VERIFY 07` and `VERIFY 08`
4. `supabase/migrations/044_bcu_products_and_entitlements.sql`
5. `scripts/sql/bcu_043_044_post_migration_verify_readonly.sql` all blocks

Do not run `043` or `044` on production as a dry-run.

## Variant A: Separate Supabase Staging Project

1. Create a separate Supabase project for staging.
2. Apply the earlier required migrations through `042` to staging, or restore a sanitized production-like schema into staging.
3. Confirm staging env vars point to the staging Supabase project only.
4. Run `scripts/sql/bcu_043_044_preflight_readonly.sql` block by block.
5. Stop if any BCU object already exists, if dependencies are missing, or if migration history already includes `043` or `044`.
6. Run `supabase/migrations/043_bcu_authoritative_wallet.sql`.
7. Run post-verification blocks `VERIFY 01` through `VERIFY 05`, plus `VERIFY 07` and `VERIFY 08`.
8. Run `supabase/migrations/044_bcu_products_and_entitlements.sql`.
9. Run the full post-verification SQL.
10. Test RLS as an authenticated user: own wallet/ledger/entitlement reads should be visible only for that user; mutating RPCs should not execute.
11. Test RPC execution with service role: `apply_bcu_ledger_entry` and `activate_bcu_product` should execute only from trusted backend/service-role context.
12. Test authenticated rejection: authenticated role must not have execute privilege on mutating BCU RPCs.
13. Test idempotency: repeating the same idempotency key with identical payload should return the existing ledger behavior; conflicting payload should reject.
14. Test concurrent Communication Plus activation: concurrent calls should not double charge when an active indefinite `communication_plus` entitlement already exists.
15. Delete the staging project or keep it explicitly as staging for future migration rehearsals.

## Variant B: Controlled Production Run

Use only if no separate staging Supabase project exists, after manual approval. This is not a dry-run.

1. Confirm a current Supabase backup exists and is restorable.
2. Keep `BCU_WALLET_ENABLED=false` and `VITE_BCU_WALLET_ENABLED=false`.
3. Record legacy row counts from preflight `BLOCK 05`.
4. Run `scripts/sql/bcu_043_044_preflight_readonly.sql` block by block.
5. Stop for any collision, missing dependency, incompatible FK type, or migration-history hit.
6. Run only `supabase/migrations/043_bcu_authoritative_wallet.sql`.
7. Run post-verification blocks `VERIFY 01` through `VERIFY 05`, plus `VERIFY 07` and `VERIFY 08`.
8. Run `supabase/migrations/044_bcu_products_and_entitlements.sql` only after `043` verification passes.
9. Run the full post-verification SQL.
10. Do not create wallets, ledger entries, or entitlements as part of production validation.
11. Do not enable the BCU feature flag.
12. Smoke-test the old application flows that use legacy wallets and coins.

## STOP CONDITIONS

- Any BCU object already exists before migration.
- Migration `043` or `044` appears in Supabase migration history.
- Any FK target type does not match the migration column type.
- A required table or function is missing.
- A BCU function has a different signature than expected.
- `authenticated` has execute privilege on mutating RPCs.
- Legacy row count changes after migration.
- Product seed amount differs from the expected BCU value.
- Baseline application typecheck/build/test fails after docs/scripts-only changes.
- Production backup is missing or unverified before Variant B.

## Review Notes For 043/044

- Run order is `043` then `044`; `044` depends on BCU tables/functions created by `043`.
- `gen_random_uuid` depends on the Supabase `pgcrypto` setup; migration `001` already contains `create extension if not exists "pgcrypto"`.
- `pg_advisory_xact_lock` is a built-in PostgreSQL function and is checked in preflight.
- `set_updated_at` is created by migration `001` and is required by triggers in both migrations.
- The immutable ledger trigger fires before update/delete, not insert, so it should not block ledger inserts.
- `service_role` should bypass RLS and should be the only role with execute on mutating BCU RPCs.
- `043` ends after dropping the policy named `Users can read own BCU migration reconciliation`; it does not recreate that policy. This is valid SQL but means authenticated users will not see reconciliation rows through RLS unless a later migration adds a policy.
- `activate_bcu_product` returns `jsonb`, matching the backend service expectation.
- `apply_bcu_ledger_entry` returns `public.bcu_ledger_entries`, matching the backend service expectation.
