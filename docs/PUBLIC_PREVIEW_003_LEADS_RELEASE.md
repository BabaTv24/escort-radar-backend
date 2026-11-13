# ER-V1-PUBLIC-PREVIEW-003 — lejek zainteresowanych (lead generation) — wydanie i aktywacja

Gałąź `feature/v1-public-preview`. Zawiera też zamknięcie rejestracji (`PUBLIC_PREVIEW_003_REGISTRATION.md`).
Prywatność i projekt Datenschutzerklärung: `WAITLIST_PRIVACY.md`.

## 1. Flagi (niezależne)

| Zmienna | Domyślnie | Znaczenie |
|---|---|---|
| `COMMERCIAL_OPERATIONS_ENABLED` | false | zakupy, płatności, rejestracja kont — **pozostaje false** |
| `WAITLIST_COLLECTION_ENABLED` | false | formularz zainteresowania; false = przyciski ukryte (stare CTA bez zmian), API 403, nic nie zapisuje i nie wysyła |
| `WAITLIST_LAUNCH_SEND_ENABLED` | false | jednorazowa informacja o starcie z panelu admina; false = 409 |

Lista otwiera się tylko gdy `WAITLIST_COLLECTION_ENABLED=true` **i** skonfigurowano e-mail (`WAITLIST_SMTP_HOST`, `WAITLIST_MAIL_FROM`,
`WAITLIST_TOKEN_SECRET` ≥ 32 znaki). Bez e-maila: `waitlist_enabled:false`, API 503 — zgłoszenia nie są przyjmowane.
Wypisanie (`/waitlist/unsubscribe`) działa zawsze, także przy wyłączonej liście.

## 2. Elementy

- Przyciski: „Ich interessiere mich für Premium / Jestem zainteresowany Premium / I'm interested in Premium” oraz
  „Ich möchte ein Inserat schalten / Chcę dodać ogłoszenie / I want to advertise” — zastępują istniejące CTA w miejscu (FanPage: 5 CTA,
  strona rejestracji w podglądzie: po 1 w karcie oferty, cennik: 1 dla wybranego produktu). Brak nowych, konkurujących przycisków.
- Modal: e-mail, segment (automatycznie), język (z UI), zgoda (domyślnie odznaczona), cena przyszłej oferty, 5 zastrzeżeń
  (bez konta, bez zamówienia, bez rezerwacji, bez obowiązku zapłaty, bez gwarancji dostępności). Bez hasła, telefonu, adresu, płatności, pól tekstowych.
- Strony: `/waitlist/confirm?token=…` (POST tokenu z JS — skanery linków nie potwierdzają), `/waitlist/unsubscribe?id=…&token=…` (wymaga kliknięcia).
- API: `POST /api/waitlist/interest|confirm|unsubscribe`; admin: `GET /api/admin/leads/summary|export`, `POST /api/admin/leads/announcements/preview|send`.
- Admin → **Lead Intelligence**: potwierdzeni (unikalne adresy), Premium, ogłoszeniodawcy, oczekujące, nowe 7/30 dni, trend dzienny,
  wskaźnik potwierdzeń, języki, źródła, wypisani, eksport CSV (audyt), podgląd i (po odblokowaniu) wysyłka informacji o starcie.
- Migracja `063_waitlist_leads.sql` (nowe tabele i funkcja, bez zmian istniejących danych). Zależność backendu: `nodemailer@6.10.1`.

## 3. Testy DEV (izolowane; Mailpit lokalny, bez wysyłki na zewnątrz)

| Zakres | Wynik |
|---|---|
| Lista wyłączona (403, nic nie zapisane ani wysłane, admin działa, rejestracja 403) | 8/8 |
| Lista włączona: walidacja, honeypot, double opt-in, token jednorazowy i wygasający, duplikaty, oba segmenty, PL/EN e-mail, wypisanie, liczby w adminie zgodne z bazą, RLS (anon/zalogowany), admin-only, eksport + audyt, blokada wysyłki, limity, brak kont | 50/50 |
| Informacja o starcie (DEV z flagą): fraza potwierdzenia, tylko potwierdzeni i niewypisani, `List-Unsubscribe`, zapis dostaw, brak duplikatu, audyt | 9/9 |
| Brak e-maila → 503, nic nie zapisane; błąd SMTP → 502, brak rekordu, ponowna próba wysyła | OK |
| Regresja podglądu (Radar, profile, kontakty, płatności 409, admin, logowanie) | 55/55 |
| Tryb komercyjny / płatności A–L | 6/6, 64/64 |
| UI 3 języki × desktop/mobile (FanPage, modal, potwierdzenie, wypisanie, rejestracja, cennik, admin) | bez błędów JS, bez przewijania w poziomie; lista wyłączona → UI jak dotąd |
| Repozytorium / typecheck | 599/599, OK |

Zrzuty: `.artifacts/public-preview-003/waitlist/`.

## 4. Wydanie (bez aktywacji listy)

1. Supabase: SQL Editor → `062_traffic_analytics.sql` (jeśli jeszcze nie) i `063_waitlist_leads.sql`; potem
   `supabase migration repair --status applied 062` i `… 063`. **Nie używać `db push`.**
   Kontrola: `select to_regclass('public.waitlist_leads');` → istnieje.
2. Render: commit wydania. Nie ustawiać `COMMERCIAL_OPERATIONS_ENABLED`, `WAITLIST_COLLECTION_ENABLED`, `WAITLIST_LAUNCH_SEND_ENABLED`.
3. Hostinger: ZIP z tego samego commita.
4. Akceptacja: `GET /api/platform/status` → `waitlist_enabled:false`, `registration_open:false`;
   `POST /api/waitlist/interest` z `{}` → 403 `WAITLIST_DISABLED`; FanPage bez nowych przycisków; Admin → Lead Intelligence: „Erfassung deaktiviert”.

## 5. Przyszła aktywacja (tylko po autoryzacji BOSS)

> Od ER-V1-LEADS-HOSTINGER-MAIL-API-004 produkcja wysyła przez **Hostinger Mail API (HTTPS)** — Render FREE blokuje SMTP.
> Zmienne i token: `HOSTINGER_MAIL_API.md`. Pkt 3–4 poniżej (SMTP) dotyczą tylko DEV.

1. Wyjaśnić z Jobcenter (Einstiegsgeld / §16c SGB II) zgodność publikacji formularza z planowanym startem działalności.
2. Uzupełnić dane administratora i dostawcy e-mail; prawnik zatwierdza `WAITLIST_PRIVACY.md` §6; opublikować sekcję w Datenschutzerklärung.
3. Wybrać firmowego dostawcę SMTP (AVV, najlepiej region UE), skonfigurować SPF/DKIM/DMARC dla domeny nadawcy.
4. Render → Environment:
   `WAITLIST_SMTP_HOST`, `WAITLIST_SMTP_PORT` (587 lub 465), `WAITLIST_SMTP_SECURE` (true dla 465), `WAITLIST_SMTP_USER`, `WAITLIST_SMTP_PASS`,
   `WAITLIST_MAIL_FROM` (np. `Escort-Radar <noreply@escort-radar.fun>`), opcjonalnie `WAITLIST_MAIL_REPLY_TO`,
   `WAITLIST_TOKEN_SECRET` (`openssl rand -base64 48`; nie zmieniać później — unieważnia linki wypisania),
   sprawdzić `APP_URL=https://escort-radar.fun` (linki w e-mailach).
5. Test z własnym adresem BOSS przy `WAITLIST_COLLECTION_ENABLED=true` na krótko, sprawdzić e-mail, potwierdzenie, wypisanie, licznik w adminie.
6. `WAITLIST_COLLECTION_ENABLED=true` → Save → redeploy. Wyłączenie: usunąć zmienną → lista natychmiast zamknięta.
7. Informacja o starcie (dopiero przy starcie komercyjnym): `WAITLIST_LAUNCH_SEND_ENABLED=true`, Admin → Lead Intelligence → podgląd →
   „Start-Benachrichtigung senden” → wpisać `SEND client_premium` / `SEND advertiser`. Jedna wysyłka na segment. Potem flagę usunąć.

## 6. Wycofanie

Render/Hostinger → poprzednie wydanie. Migracja 063 może zostać (nieużywane tabele). Usunięcie danych listy tylko na polecenie BOSS:
`drop function if exists public.prune_waitlist(integer, integer, integer); drop table if exists public.waitlist_deliveries, public.waitlist_announcements, public.waitlist_leads;`
