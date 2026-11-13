# Hostinger Mail API — transport e-mail dla listy zainteresowanych (ER-V1-LEADS-HOSTINGER-MAIL-API-004)

Render FREE blokuje wychodzące porty SMTP (25/465/587), więc na produkcji listę obsługuje **Hostinger Mail API przez HTTPS**.
SMTP (`nodemailer`) zostaje do testów lokalnych (DEV → Mailpit).

## 1. Źródło (zweryfikowane 2026-11-13)

- `https://api.mail.hostinger.com/` → przekierowanie na `https://docs.hostinger.com/emails/mail-api`.
- Specyfikacja: `https://api.mail.hostinger.com/openapi/openapi.json` — „Hostinger Mail API” **1.3.0**
  (kopia: `.artifacts/hostinger-mail-api/openapi-1.3.0.json`, SHA-256 `7d8d1e2cf34d316ca7d85ce8555c7b66b860c6713a4f45f68eb1d9a680a50367`).
- Użyte elementy:
  - `Authorization: Bearer <token>`; token tworzony w **Hostinger Panel → e-mail → zakładka provisioning (API)**, przypisany do **jednego zamówienia**
    (dostęp tylko do skrzynek tego zamówienia, opcjonalnie ograniczony do wybranych skrzynek).
  - `GET /api/v1/me` → `{ data: { orderResourceId, mailboxes: [{ resourceId: "AC…", address }] } }`.
  - `POST /api/v1/mailboxes/{mailboxResourceId}/send` → body `{ to[], displayName, subject, text, html }`, **204** = przyjęte do wysyłki
    (późniejszy błąd doręczenia nie jest raportowany w tym wywołaniu; kopia trafia do `INBOX.Sent`).
  - Błędy: 401 `ERR_UNAUTHORIZED`, 403 `ERR_FORBIDDEN`, 422 `ERR_VALIDATION_FAILED`, 429 (limit; powtarzane przekroczenia mogą
    czasowo zablokować IP), 500/502/504. Wszystkie żądania `application/json`.
- Ograniczenia API: **brak pól na własne nagłówki** (nie ma `List-Unsubscribe`) i **brak reply-to** — link wypisania jest w treści każdej wiadomości.
- Sprawdzenie produkcyjnego API bez tokenu: `GET /api/v1/me` → 401 `ERR_UNAUTHORIZED` (zgodnie ze specyfikacją).
- **Plan / dostęp do API:** dokumentacja nie wymienia ograniczeń planu. Czy obecny plan skrzynek ma API, potwierdzi dopiero utworzenie tokenu
  w panelu i test `mail-check` (pkt 5). Bez tokenu nie da się tego sprawdzić z zewnątrz.

## 2. Implementacja

- `Back/src/hostingerMail.ts` — adapter (fetch, timeout 15 s, bez przekierowań, HTTPS obowiązkowe na produkcji; mapowanie błędów na kody
  `MAIL_AUTH_FAILED | MAIL_FORBIDDEN | MAIL_REJECTED | MAIL_RATE_LIMITED | MAIL_UNAVAILABLE | MAIL_TIMEOUT`).
- `Back/src/waitlist.ts` — wybór transportu (`WAITLIST_MAIL_TRANSPORT`), pauza dostawcy: po 429 wg `Retry-After` (30 s – 15 min, domyślnie 60 s),
  po 401/403 na 5 min — w tym czasie API nie jest wywoływane (ochrona przed blokadą IP).
- Odpowiedzi formularza: 502 `WAITLIST_MAIL_FAILED` (na pewno nie wysłano → rekord nie zostaje, ponowna próba wysyła),
  503 `WAITLIST_MAIL_BUSY` (limit/pauza), 502 `WAITLIST_MAIL_UNCERTAIN` (timeout/504: wynik nieznany → rekord i 10-min odstęp zostają,
  natychmiastowa ponowna próba **nie** wysyła drugiego e-maila).
- Informacja o starcie (nadal wyłączona flagą): przy 429/401/403 zatrzymuje się i może być wznowiona bez duplikatów (pomija odbiorców z zapisem dostawy).
- Admin → Lead Intelligence: odznaka transportu, odznaka pauzy, przycisk **„Mail-API prüfen (sendet nichts)”** (`GET /api/admin/leads/mail-check`,
  zapis w audycie) — sprawdza token, skrzynkę i zgodność adresu nadawcy; nie zwraca tokenu.

## 3. Zmienne Render (Environment — tylko backend, nigdy w GitHub/frontendzie)

| Zmienna | Wartość |
|---|---|
| `WAITLIST_MAIL_TRANSPORT` | `hostinger_api` |
| `HOSTINGER_MAIL_API_TOKEN` | token z Hostinger Panel (sekret) |
| `HOSTINGER_MAIL_MAILBOX_ID` | `resourceId` skrzynki `kontakt@support.escort-radar.fun` (format `AC…`, z `GET /api/v1/me`) |
| `HOSTINGER_MAIL_SENDER` | `kontakt@support.escort-radar.fun` (kontrola zgodności w mail-check) |
| `WAITLIST_MAIL_DISPLAY_NAME` | `Escort-Radar` (opcjonalnie; nazwa w polu Od) |
| `WAITLIST_TOKEN_SECRET` | `openssl rand -base64 48` (sekret, min. 32 znaki; nie zmieniać po starcie — unieważnia linki wypisania) |
| `APP_URL` | `https://escort-radar.fun` (linki w e-mailach — sprawdzić, czy ustawione) |
| `HOSTINGER_MAIL_API_URL` | nie ustawiać (domyślnie `https://api.mail.hostinger.com`) |
| `WAITLIST_SMTP_*` | nie ustawiać na Render |
| `WAITLIST_COLLECTION_ENABLED`, `WAITLIST_LAUNCH_SEND_ENABLED`, `COMMERCIAL_OPERATIONS_ENABLED`, `ANALYTICS_COLLECTION_ENABLED` | **nie ustawiać** (= false) |

Ustawienie zmiennych e-mail przy wyłączonych flagach niczego nie wysyła ani nie otwiera (`waitlist_enabled:false`).

## 4. Token Hostinger — konfiguracja

1. Hostinger Panel → E-maile → domena `support.escort-radar.fun` → zakładka provisioning / API → **utwórz token API**;
   jeśli panel pozwala, ogranicz go do skrzynki `kontakt@support.escort-radar.fun`.
2. Skopiuj token tylko do Render → Environment (`HOSTINGER_MAIL_API_TOKEN`). Nie zapisywać w repozytorium, czacie ani notatkach.
3. Odczytaj `resourceId` skrzynki (bez wysyłania):
   `curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/json" https://api.mail.hostinger.com/api/v1/me`
   → wpis z `"address":"kontakt@support.escort-radar.fun"` → `resourceId` (np. `AC…`) do `HOSTINGER_MAIL_MAILBOX_ID`.
   Jeśli odpowiedź to 401/403 albo skrzynki nie ma na liście → plan/zamówienie nie daje dostępu API do tej skrzynki: zgłosić do supportu Hostinger.
4. Rotacja: nowy token w panelu → podmiana w Render → redeploy → stary token usunąć w panelu.

## 5. Migracja 063 (Supabase, jeśli jeszcze nie zastosowana)

SQL Editor → wkleić `supabase/migrations/063_waitlist_leads.sql` → Run (idempotentna, tylko nowe tabele i funkcja).
Potem `supabase migration repair --status applied 063` (oraz `062`, jeśli też ręcznie). **Nie używać `supabase db push`.**
Kontrola: `select to_regclass('public.waitlist_leads'), to_regclass('public.waitlist_announcements'), to_regclass('public.waitlist_deliveries');`.

## 6. Testy akceptacyjne produkcji (flagi wyłączone; nic nie jest wysyłane)

| # | Test | Oczekiwane |
|---|---|---|
| H1 | `GET /api/version` | commit wydania |
| H2 | `GET /api/platform/status` | `registration_open:false`, `purchases_enabled:false`, `analytics_enabled:false`, `waitlist_enabled:false` |
| H3 | `POST /api/waitlist/interest` z `{}` | 403 `WAITLIST_DISABLED` |
| H4 | Admin → Lead Intelligence | „Erfassung deaktiviert”, „Versand: Hostinger Mail API”, „Start-Benachrichtigung gesperrt” |
| H5 | Admin → „Mail-API prüfen” | „Mail-API erreichbar, Postfach kontakt@support.escort-radar.fun freigegeben.” (wywołuje tylko `GET /me`) |
| H6 | FanPage, `/register`, `/pricing` | brak przycisków zainteresowania (lista wyłączona), rejestracja „wkrótce” |
| H7 | `POST /api/auth/register` z `{}` | 403 `REGISTRATION_CLOSED` |

Test wysyłki na produkcji (H8) dopiero przy autoryzowanym otwarciu listy: krótko `WAITLIST_COLLECTION_ENABLED=true`, zgłoszenie na własny adres BOSS,
potwierdzenie, wypisanie, licznik w adminie; potem decyzja BOSS, czy lista zostaje otwarta.

## 7. Wycofanie

`WAITLIST_MAIL_TRANSPORT` usunąć (→ SMTP bez konfiguracji → lista zamknięta) albo cofnąć deploy. Token unieważnić w Hostinger Panel.
