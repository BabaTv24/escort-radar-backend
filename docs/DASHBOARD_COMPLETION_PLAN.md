# Dashboard completion plan (code inspection, no authenticated E2E)

> **Superseded in part by `ESCORT_RADAR_BUSINESS_CONTRACT_V1.md`.** Favorites and booking requests are free and require Premium (client activation). BC subscription renewal stays blocked until the owner approves a rate.

Status means **COMPLETE** only when runtime behavior has been verified. Code presence alone is **PARTIAL** or **NOT VERIFIED**. Existing user edits in auth/frontend files must be preserved.

## Customer dashboard

| Capability | Status | Evidence / next acceptance check |
|---|---|---|
| Registration and login | PARTIAL | `Front/src/pages/RegisterPage.tsx`, `LoginPage.tsx`, `Back/src/routes/auth.ts`; exercise isolated Supabase signup and login, including current uncommitted changes. |
| Email verification | NOT VERIFIED | Resend endpoint in `Back/src/routes/auth.ts`; verify confirmation, expired link, redirect, and blocked unverified login. |
| Profile and settings | PARTIAL | `Front/src/pages/DashboardPage.tsx`, `Back/src/routes/clientPersonalProfile.ts`, `clientPreferences.ts`; save and reload consent and profile fields. |
| Favorites | PARTIAL | `Back/src/routes/favorites.ts`, dashboard favorites section; test add, remove, ownership, persistence. |
| Browsing history | MISSING | No dedicated browsing history found in dashboard; decide required privacy semantics before implementation. |
| Radar and discovery | PARTIAL | Dashboard radar preview links to `/city/berlin`; verify relevance, location consent, discovery and responsive behavior. |
| Messaging | PARTIAL | Sponsored chat and booking requests exist; verify role gates, delivery, empty/error states. |
| Mobile navigation and privacy | NOT VERIFIED | Dashboard JSX exists; inspect desktop/mobile against UI contract and mockups before any UI patch. |

## Advertiser dashboard

| Capability | Status | Evidence / next acceptance check |
|---|---|---|
| Registration and login | PARTIAL | Shared auth; verify advertiser/business role assignment and confirmation. |
| Profile editor, completeness, location, images | PARTIAL | `DashboardPage.tsx`, `Front/src/components/advertiser-dashboard/*`, `Back/src/routes/profiles.ts`, `uploads.ts`; verify save, upload, ownership, location privacy. |
| Publication and moderation | PARTIAL | Profile and admin routes contain status logic; verify approved/paid/verified transitions and rejection. |
| Subscription status and progress | PARTIAL | `AdvertiserSubscriptionProgress` uses dates and status; test expired, renewed, missing dates, and actual server access. |
| 333 BC / 30 days | BROKEN | Product exists in `supabase/migrations/044_bcu_products_and_entitlements.sql` at 333.2666 BC and `Front/src/lib/bigcoins.ts`; `/api/bcu/products/:productCode/activate` accepts only `communication_plus`, so advertiser purchase cannot complete through this API. No authenticated flow was executed. |
| Sponsored profiles, wallet, statistics | PARTIAL | Sponsored routes and wallet UI exist; verify ownership, balances, eligibility, real stats. |
| Payment and customer communication | PARTIAL | Manual order flow and sponsored chat/requests exist; test end to end in isolated environment. |
| Mobile and account settings | NOT VERIFIED | No advertiser-specific approved mockup in `docs/ui/dashboard-advertiser.md`; preserve layout and test forms at 390/360 px. |

## Admin dependencies

`Front/src/pages/AdminPage.tsx` and `Back/src/routes/admin.ts` provide profile moderation, client management, subscription controls and manual order approval/rejection. Verify account verification, advertisement approval, payment evidence review, idempotent application, subscription revoke/extension, and support/report workflows. Avoid redesign.

## Priority and acceptance

- **P0 customer:** isolated signup → verified login → profile/preferences → favorite/radar → privacy/account controls work on desktop and mobile; no unauthorized data access.
- **P0 advertiser:** profile → media/location → moderation → payment confirmation → active entitlement → expiry/restriction work end to end; 333 BC path either implemented correctly or removed from purchasable offer with owner-approved product decision.
- **P0 admin:** payment approval requires evidence and is idempotent; moderation and account verification are auditable.
- **P1:** browsing history if product requires it, richer statistics, responsive polish after P0 flows.

For any visual change read `UI_IMPLEMENTATION_CONTRACT.md`, the relevant `docs/ui/` spec, and inspect assigned `Mockup/` images; capture 100% zoom desktop/mobile comparisons before acceptance. Run targeted existing tests (`tests/emailConfirmationSignup.test.ts`, `bcuWalletNormalization.test.ts`, `advertiserDashboardArchitecture.test.ts`, `clientPremiumBcu.test.ts`, `adminOperations.test.ts`) and authenticated browser checks against isolated Supabase. No demo data in production code.
