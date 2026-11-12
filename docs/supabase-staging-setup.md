# Supabase staging bootstrap

This procedure creates an isolated schema rehearsal target through migration 045. Production project `lcvktbcfoizlalvjrdgh` is forbidden by the guard script. Migration 046 is outside this bootstrap.

## Canonical schema path

Use the canonical files `supabase/migrations/001_*.sql` through `045_*.sql`, in filename order, against a new empty Supabase project. Do not also execute the manual BCU packages:

- `STEP_03_044_clean.sql` is byte-equivalent in content to migration 044.
- `STEP_06_045_clean.sql` is byte-equivalent in content to migration 045.
- `bcu_043_045_manual_apply_package.sql` contains the canonical migrations as a manual production package.
- STEP verify/precheck/reconciliation files are operational checks, not schema migrations.

Running both paths would duplicate DDL and seed operations. A production schema dump is unnecessary and risks importing production-specific state or data.

## Create the isolated project

1. In Supabase Dashboard create a new project explicitly named as staging.
2. Prefer the production region only for representative latency; do not reuse the production project or database password.
3. Generate a separate strong database password and store it in the user's secure password manager.
4. Do not copy production Auth users, service-role keys, database dumps, Storage objects, webhooks, or Edge Functions.
5. Obtain the new project ref and the direct database or pooler connection URL.
6. Set variables only in the current secure user session or a secret manager. Never add them to repository files.

```powershell
$env:SUPABASE_STAGING_PROJECT_REF='<20-character-staging-ref>'
$env:SUPABASE_STAGING_DB_URL='<postgresql-staging-connection-url>'
& .\scripts\staging\assert-staging-target.ps1
```

The assertion must print `Target: SAFE`. It prints only a masked host, project ref, database name and port.

## Precheck and backup

For a new project, save the initial schema snapshot from Supabase Dashboard or with an approved local `pg_dump --schema-only`. Store it below `backups/staging/`, which is ignored by Git.

Run the read-only inventory:

```powershell
& .\scripts\staging\precheck-staging-schema.ps1
```

## Apply through 045

Review the ordered manifest emitted by the filesystem and confirm the target again. The script uses only canonical migrations 001–045, stops on the first PostgreSQL error, and never includes 046.

```powershell
$env:CONFIRM_STAGING_SCHEMA_APPLY='YES'
& .\scripts\staging\apply-through-045.ps1
Remove-Item Env:CONFIRM_STAGING_SCHEMA_APPLY
```

If `psql` is unavailable, apply the same files one at a time in Supabase SQL Editor, beginning with 001 and ending with 045. Re-run target assertion before opening the editor, visually confirm the staging project name/ref, stop on the first error, and never paste migration 046 during bootstrap.

Then run `scripts/staging/verify-through-045.sql` in the staging SQL Editor or with `psql`. Every required object must be present, restricted BCU RPCs must be executable only by `service_role`, and both migration-046 absence checks must return true.

## Auth and Storage minimum

- Supabase-provided `auth`, `storage`, `anon`, `authenticated`, and `service_role` facilities must exist.
- Migration 001 enables `pgcrypto`; no other extension is manually required by migrations 001–045.
- Schema bootstrap requires no real Auth users and no production data.
- Migration 046 integration tests require synthetic `auth.users` because profiles, wallets, transfers and ledger rows use Auth foreign keys. Use only technical addresses under `example.invalid`.
- Favorites BCU tests do not require a Storage bucket, Storage objects, Auth providers beyond technical email accounts, Edge Functions, webhooks, or external URLs.

## Migration audit 001–045

Legend: `Ready` means suitable in canonical order on an empty Supabase project; seed means deterministic catalog/config seed, not user data.

| No. | Migration | Empty DB in order | Prerequisites / external dependency | Seed / production values | Manual action | Readiness |
|---:|---|---|---|---|---|---|
| 001 | initial_schema | Yes | Supabase `auth.users`, `pgcrypto` | None | No | Ready |
| 002 | profile_search_fields | Yes | 001 profiles | None | No | Ready |
| 003 | profile_service_menu | Yes | 001 profiles | None | No | Ready |
| 004 | subscription_and_bookings | Yes | profiles, Auth/RLS | None | No | Ready |
| 005 | radar_status_fields | Yes | profiles | None | No | Ready |
| 006 | category_geo_search | Yes | profiles; normalizes existing rows | Canonical categories | No | Ready |
| 007 | admin_panel_controls | Yes | profiles | Defaults only | No | Ready |
| 008 | accounts_referrals_phone_rules | Yes | profiles | None | No | Ready |
| 009 | closed_token_economy | Yes | profiles, `auth.users` | Token package seed | No | Ready |
| 010 | tags_master_wallet_admin_controls | Yes | profiles, wallets, packages | Tags/admin reserve seed | No | Ready |
| 011 | auth_account_role_security | Yes | Auth JWT functions and `auth.users` trigger rights | None | No | Ready |
| 012 | fix_auth_app_metadata_and_admin_mvp | Yes | 011 functions, profiles | Subscription backfill | No | Ready |
| 013 | variant_b_client_activation | Yes | profiles, Auth | None | No | Ready |
| 014 | client_profile_avatar | Yes | Auth | None | No | Ready |
| 015 | client_activation_payments_admin_stats | Yes | Auth | None | No | Ready |
| 016 | profile_location_mode_and_services | Yes | profiles | Defaults | No | Ready |
| 017 | profile_work_location | Yes | profiles | None | No | Ready |
| 018 | radar_operator_mode | Yes | profiles | Defaults | No | Ready |
| 019 | client_intent_system | Yes | profiles, Auth | None | No | Ready |
| 020 | admin_profile_studio_seed_profiles | Yes | profiles | Backfills flags; no fixed users | No | Ready |
| 021 | profile_moderation_stabilization | Yes | profiles | Status normalization | No | Ready |
| 022 | admin_subscription_management | Yes | profiles | None | No | Ready |
| 023 | admin_full_profile_creation | Yes | profiles, subscriptions | Subscription backfill | No | Ready |
| 024 | admin_control_center_upgrade | Yes | profiles, reports/images | App setting seed | No | Ready |
| 025 | profiles_postal_code | Yes | profiles | None | No | Ready |
| 026 | location_catalog | Yes | none beyond public schema | Location catalog seed | No | Ready |
| 027 | profile_more_about_me_fields | Yes | profiles | None | No | Ready |
| 028 | account_access_logs | Yes | profiles, Auth | None | No | Ready |
| 029 | real_revenue_and_sponsored_profiles | Yes | profiles | Zero UUID sentinel only | No | Ready |
| 030 | escort_radar_stripe_integration | Yes | payment/profile tables | No Stripe secrets or URLs | No | Ready |
| 031 | manual_payment_orders_and_compliance | Yes | profiles, Auth | None | No | Ready |
| 032 | profile_structured_details | Yes | profiles | None | No | Ready |
| 033 | location_price_service_pricing | Yes | profiles | Defaults | No | Ready |
| 034 | client_favorites_token_cost | Yes | profiles, wallets, transactions, Auth | None | No | Ready |
| 035 | client_search_location_preferences | Yes | client_profiles | None | No | Ready |
| 036 | fix_profiles_category_status_constraints | Yes | profiles | Status normalization | No | Ready |
| 037 | fix_token_wallet_source_of_truth | Yes | 034 objects | None | No | Ready |
| 038 | dedupe_wallets_unique_user | Yes | wallets/transactions/favorites | Empty-safe dedupe | No | Ready |
| 039 | client_personal_profiles | Yes | Auth | None | No | Ready |
| 040 | update_bc_coin_packages | Yes | token_packages | Package catalog seed | No | Ready |
| 041 | bc_coin_packages_admin_management | Yes | none beyond public schema | Package catalog seed | No | Ready |
| 042 | profile_import_source_fields | Yes | profiles | None | No | Ready |
| 043 | bcu_authoritative_wallet | Yes | wallets, coin_wallets, Auth, `set_updated_at` | No balances seeded | No | Ready; full migration |
| 044 | bcu_products_and_entitlements | Yes | 043 ledger/RPC, Auth | Seven authoritative products | No | Ready; full migration |
| 045 | client_premium_bcu_atomic | Yes | 043–044 plus activation/referral/reward tables | No user rewards seeded | No | Ready; full migration |

No migration 001–045 contains an environment-specific URL, production project ref, real user UUID, service key, webhook configuration, Storage bucket creation, or Edge Function deployment. Fixed values are catalog/configuration seeds and the zero-UUID sentinel in migration 029.

## After validation

Create synthetic technical users only for migration-046 integration tests. When staging is no longer needed, export required non-secret reports, remove technical users and test artifacts, then delete the staging project in Supabase Dashboard. Clear local staging environment variables afterwards.
