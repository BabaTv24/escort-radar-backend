# ER-V1-PUBLIC-PREVIEW-001 — tryb publicznego podglądu i analityka ruchu

Stan na 2026-11-12. Gałąź `feature/v1-public-preview` (bazuje na `cb36d79`). Bez sekretów i danych osobowych.

> Zaktualizowane przez `PUBLIC_PREVIEW_002_RELEASE.md`: zbieranie analityki domyślnie wyłączone, retencja 60 dni,
> profile_view bez pseudonimu, maskowanie kontaktów w danych publicznych. Tam aktualne instrukcje wdrożenia.

## 1. Flaga `COMMERCIAL_OPERATIONS_ENABLED`

- Odczyt: `Back/src/config.ts`; brak zmiennej = `false` = PUBLIC PREVIEW. Egzekwowanie wyłącznie na serwerze (`Back/src/commercialOperations.ts`).
- Wyłączone w podglądzie (HTTP 409 `COMMERCIAL_OPERATIONS_DISABLED`):
  zamówienia ręczne (`/api/payments/manual-orders`, `/create-order`), wszystkie checkouty Stripe, `/api/client-activation/checkout|confirm`,
  zakup BC (`/api/tokens/purchase-intent`), zatwierdzanie płatności przez admina (zamówienia ręczne i zakupy BC).
  Webhook Stripe → 410. `/api/payments/manual-products` zwraca pustą listę.
- Działa bez zmian: FanPage, LIVE Radar, katalog, profile publiczne, istniejący Premium, panel admina (odrzucanie/anulowanie zamówień, moderacja,
  zarządzanie profilami, ręczna aktywacja konta przez admina — to nie jest płatność).
- `GET /api/platform/status` informuje frontend o trybie; frontend przy braku odpowiedzi zakłada podgląd.

## 2. Rejestracja

- `POST /api/auth/register` z `auth_account_type=escort` → 403 `ADVERTISER_REGISTRATION_CLOSED` (konto nie powstaje). `business` jak dotąd 403.
- ~~Rejestracja klientów działa.~~ Od 003 zamknięta w podglądzie (`REGISTRATION_CLOSED`), zob. `PUBLIC_PREVIEW_003_REGISTRATION.md`. Istniejące konta i profile ogłoszeniodawców bez zmian; tylko admin/claim mogą nadać typ ogłoszeniodawcy.
- **Naprawiona eskalacja uprawnień:** `POST /api/profiles` czytał `is_test_account` z body oraz traktował każdy adres z `+test` jako konto testowe
  → profil od razu `active`, `verified`, `moderation_status=approved` (publiczny bez moderacji i płatności). Teraz status testowy nadaje wyłącznie admin.
- Komunikaty: DE „Registrierung für Inserenten startet in Kürze.”, PL „Rejestracja ogłoszeniodawców już wkrótce.”, EN „Advertiser registration opens soon.”

## 3. Analityka (bez cookies)

- Brak cookies, localStorage, identyfikatorów i śledzenia między stronami. Nie zapisujemy IP, user-agenta, konta ani e-maila.
- `visitor_hash` = SHA-256(losowa sól dzienna + adres + UA), skrócony; sól usuwana po dniu następnym ⇒ unikalni odwiedzający są **szacowani per dzień**.
- Liczone tylko z `https://escort-radar.fun` (Origin), bez botów/automatyzacji (UA, `navigator.webdriver`), z poszanowaniem DNT/GPC; limit 120 zdarzeń / 10 min / odwiedzającego.
- Zdarzenia: `page_view`, `radar_view`, `city_search`, `profile_view`, `premium_cta_click`, `advertiser_cta_click`; tylko szablony ścieżek (bez query).
- Kraj tylko z nagłówka brzegowego (`cf-ipcountry` itp.), bez GeoIP — jeśli Render go nie przekazuje, kraj = „nieznany”.
- Retencja: surowe zdarzenia 90 dni (`prune_traffic_analytics`, wywoływane raz dziennie przez backend).
- Dostęp: tylko `service_role` (RLS + revoke; RPC tylko dla `service_role`). Admin widzi wyłącznie agregaty (`GET /api/admin/traffic`).
- Admin Control Center → „Traffic Intelligence”: KPI 7/30 dni z trendem, wykres dzienny (+ tabela), top miasta, top profile, źródła, urządzenia, kraje,
  wskaźniki zainteresowania (CTA / 100 odsłon), nowe konta (dokładne liczby z `auth.users`).

## 4. Testy DEV

- Podgląd: 54/54 (flaga, rejestracja, eskalacja, 8 endpointów płatności, webhook, admin, FREE, Premium, analityka, prywatność, katalog).
- Tryb komercyjny (flaga `true`): 4/4; Radar identyczny w obu trybach (`491c00e4ea95cf6a`, 7 profili DEV).
- Regresja płatności (scenariusze A–L, flaga `true`): 64/64. Repozytorium: 580/580. Typecheck front + back OK.

## 5. Przegląd katalogu (produkcja, tylko odczyt publicznego API)

321 profili publicznych przeskanowanych; żaden nie zwraca chronionych pól kontaktowych. W treści opisów:
- pełny numer telefonu: `ef93bddb…` (Berlin), `95c95ee8…` (Bonn), `d62a65f6…` (Leipzig);
- uchwyt Telegram/Snapchat: `ef93bddb…`, `95c95ee8…`, `1a302c71…` (München), `ba3e893b…`, `24f75b02…` (Dortmund).
Łącznie 6 profili omija bramkę Premium dla kontaktów. 9 kolejnych tylko wspomina „kontakt przez WhatsApp” bez numeru. Rekordy nie zostały zmienione.
Szczegóły (bez danych kontaktowych): `.artifacts/public-preview-001/catalog-contact-scan.json`.

## 6. Wdrożenie (wymaga autoryzacji BOSS)

1. Supabase produkcja: zastosować migrację `062_traffic_analytics.sql` (nowe tabele i funkcje; nie zmienia istniejących danych).
2. Render: wdrożyć commit tej gałęzi. **Nie ustawiać** `COMMERCIAL_OPERATIONS_ENABLED` (brak = podgląd). Gałąź zawiera też niewdrożone `a26fe23` i `cb36d79`;
   ich funkcje płatnicze pozostają wyłączone flagą.
3. Kontrola: `/api/platform/status` → `public_preview`; `/api/payments/manual-products` → pusta lista; rejestracja `escort` → 403.
4. Hostinger: zbudować i wgrać frontend z tego samego commita.
5. Datenschutzerklärung: dopisać opis analityki (cel, podstawa prawna, brak cookies, 90 dni) — do weryfikacji prawnej przez BOSS.

Wycofanie: Render → poprzedni deploy; Hostinger → poprzedni pakiet. Migracja 062 może zostać (nieużywane tabele nie wpływają na działanie).
