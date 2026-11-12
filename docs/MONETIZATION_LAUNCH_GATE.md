# Monetization launch gate — inspected 2026-11-10

> **Superseded in part by `ESCORT_RADAR_BUSINESS_CONTRACT_V1.md`.** Booking requests and favorites are free (migration 060). No BC price for advertiser subscriptions may be invented: BC renewal stays blocked until the owner approves a rate and an endpoint exists.

**Decision: P0 launch blocked.** No production payment activation was performed. Code inspection and existing tests are evidence of implementation only; no isolated end-to-end payment or expiry test has passed in this session.

## Architecture and status

| Mechanism | Current status |
|---|---|
| Manual orders (bank transfer/crypto/manual) | `Back/src/routes/payments.ts` creates orders; `Back/src/routes/admin.ts` approves/rejects; `Back/src/manualPayments.ts` applies client activation, 30-day advertiser/business subscription or coin package. Administrative approval is the confirmation trust boundary. Payment evidence/reconciliation and refund reversal are not established by code inspection. |
| Stripe | Checkout/webhook code exists in `Back/src/services/stripePayments.ts`, but `Back/src/config.ts` defaults flags off and webhook returns 410. `invoice.payment_failed` handler exists; refund/chargeback handling was not found. Provider eligibility is a separate P0 gate. |
| CCBill / Paysafe | Flags and order labels exist; API says coming soon when disabled. Provider integration and contracts not verified. |
| BCU | Wallet/ledger/RPC and product migration exist. Migration `044_bcu_products_and_entitlements.sql` lists `advertiser_30_days` for 3,332,666 BCU (333.2666 BC), 30 days. `Front/src/lib/bigcoins.ts` has a 333 BC constant; reconcile precision and pricing. `Back/src/routes/bcu.ts` allows activation only for `communication_plus`, so the advertiser 333 BC flow is not end-to-end usable. |

Manual subscription activation sets profile start/end and auth metadata `active` (`Back/src/manualPayments.ts`). `getAdvertiserAccess` in `Back/src/middleware/auth.ts` reads metadata status and plan, with no expiry-date check. Public profile query in `Back/src/routes/profiles.ts` filters published/approved/active but not subscription end. Thus an expired paid profile may retain access or public visibility unless another job or policy changes state; no such verified mechanism was found. Progress bar date rendering is not access control. This is a P0 security and commercial blocker.

## P0 blockers and required tests

1. Use an **isolated Supabase** project and verify migrations/schema/RLS before tests. No production data or service key in local test runs.
2. Define one authoritative entitlement/expiry rule used by API writes, public discovery, sponsored features, and frontend. Test current time before/at/after expiry, renewal, admin revoke, and stale auth metadata.
3. Resolve 333 BC product price precision, advertiser purchase endpoint, idempotent ledger debit, entitlement grant, profile sync and expiry. Test insufficient funds and duplicate requests.
4. Test manual order creation, payment evidence review, approval race/retry, rejection, wrong account/product, and refund reversal. Approval must never rely solely on customer assertion of payment.
5. Test provider callbacks/signatures, failed payment, duplicate webhook, chargeback/refund, and entitlement rollback with an eligible provider before activation. Stripe is **not** an approved launch option based on current published policy.
6. Ensure paid-only discovery/contact/sponsored features are enforced by the backend and RLS where applicable, including direct API calls.
7. Verify registration/email confirmation, admin moderation, age controls, privacy requests, legal pages and support/report handling in browser and API tests.

## Germany compliance and provider verification

**Confirmed source requirements:** German commercial digital services require readily accessible provider identification under [DDG § 5](https://www.gesetze-im-internet.de/ddg/__5.html). [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/ojv) Articles 9, 13 and 17 govern special-category personal data, disclosure and erasure. [TDDDG § 25](https://www.gesetze-im-internet.de/ttdsg/__25.html) governs consent for non-essential device storage/access. The [JMStV](https://www.gesetze-bayern.de/Content/Document/JMStV/true) restricts access to certain adult material; the exact age-verification design depends on content classification. [Stripe's adult-business FAQ](https://support.stripe.com/questions/prohibited-and-restricted-businesses-list-faqs?locale=de-DE) explicitly names escort services as unsupported currently. These sources were checked on 2026-11-10.

**Requires qualified legal/provider verification:** whether this platform's specific advertisements trigger JMStV age-verification obligations; operator and advertiser duties under [ProstSchG](https://www.gesetze-im-internet.de/prostschg/BJNR237210016.html); lawful basis and controls for sensitive profile data, location, consent and retention; exact Impressum, terms, privacy and cookie text; the proposed bank, crypto, CCBill or Paysafe acceptance terms for this business. The repository README states legal pages are placeholders. Obtain written provider acceptance before enabling card payments.

## Production activation criteria

All P0 tests pass against isolated data, paid status expires and reverses reliably, moderation and age/privacy gates are reviewed, legal pages are approved, provider eligibility and reconciliation are documented, secrets and RLS are checked, and owner explicitly authorizes deployment/payment activation. Any failed item keeps the gate closed.
