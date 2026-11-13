# ER-V1-PUBLIC-PREVIEW-003 — rejestracja zamknięta w PUBLIC PREVIEW

Gałąź `feature/v1-public-preview`, bazuje na `c57f3c8` (002). Bez migracji, bez zmian danych.

**Zasada:** PUBLIC PREVIEW = publiczne przeglądanie bez zakładania nowych kont.
FREE to status zarejestrowanego klienta przed aktywacją Premium (0,99 EUR), a nie osobny produkt.
Dopóki Premium nie można kupić, rejestracja klientów też jest zamknięta.

## 1. Backend

- `POST /api/auth/register`: przy `COMMERCIAL_OPERATIONS_ENABLED` ≠ `true` → **403 `REGISTRATION_CLOSED`** dla każdego typu
  (`client`, `escort`, `business`, brak typu). Sprawdzane jako pierwsza instrukcja, przed odczytem body i przed jakimkolwiek wywołaniem Supabase,
  więc nie powstaje żaden użytkownik.
- `GET /api/platform/status` zwraca dodatkowo `registration_open` (= tryb komercyjny).
- Bez zmian: logowanie, `/api/auth/me`, istniejące konta i uprawnienia Premium, panel admina (w tym ręczne zakładanie kont przez admina),
  zakupy nadal wyłączone (409 `COMMERCIAL_OPERATIONS_DISABLED`).
- Tryb komercyjny (`true`): rejestracja klienta i ogłoszeniodawcy działa jak przed podglądem.

## 2. Ominięcie przez Supabase Auth (bezpośredni `signUp`)

Klucz anon jest publiczny (w bundlu frontendu), więc każdy może wywołać `POST https://<projekt>.supabase.co/auth/v1/signup`
albo zalogować się nowym kontem Google — z pominięciem API.
- DEV (sprawdzone): bezpośredni `signup` tworzy konto z `auth_account_type=client` (stan FREE).
- Produkcja (odczyt publicznych ustawień `/auth/v1/settings`): `disable_signup: false`, dostawcy `email` i `google` aktywni → **ominięcie jest dziś możliwe**.
- Skutek: tylko nieaktywowane konto FREE; nie daje Premium, kontaktów ani zakupów (te są blokowane po stronie serwera).

**Bezpieczne obejście (ręcznie przez BOSS, nie wykonywane automatycznie):**
Supabase Dashboard → projekt produkcyjny → **Authentication → Sign In / Providers → User Signups →
„Allow new users to sign up” = OFF** → Save.
- Blokuje nowe konta przez e-mail i przez Google (GoTrue odpowiada błędem `signup_disabled`).
- Istniejący użytkownicy nadal logują się hasłem i Google; konta tworzone przez admina (service role) nadal działają.
- Kontrola: `GET https://<projekt>.supabase.co/auth/v1/settings` (nagłówek `apikey: <anon>`) → `"disable_signup": true`.
- **Przed włączeniem trybu komercyjnego** ustawienie trzeba przywrócić na ON — inaczej `POST /api/auth/register` też nie utworzy konta
  (backend używa `signUp` z kluczem anon).
- Nie wyłączać dostawcy Google ani e-mail — to zablokowałoby logowanie istniejących kont.

## 3. Frontend

- `/register` (każdy wariant `?type=`) w podglądzie: brak formularza, pól hasła i przycisku wysyłki; zamiast tego ekran „wkrótce”
  z komunikatem DE/PL/EN, CTA do LIVE Radar (`/city/berlin`), linkiem „Masz już konto? Zaloguj się” oraz zapowiedzią produktów:
  Premium-klient (jednorazowo 0,99 EUR), ogłoszeniodawca (49,99 EUR / 30 dni), ESCORT Office Center (w przygotowaniu). FREE nie jest prezentowany.
- Do czasu odpowiedzi serwera frontend przyjmuje podgląd (formularz nie mignie). W trybie komercyjnym formularz wraca bez zmian.

## 4. Testy (DEV, izolowane)

| Zakres | Wynik |
|---|---|
| Podgląd E2E (rejestracja 5 typów + pusty request → 403, 0 nowych użytkowników; istniejący klient loguje się; Premium zachowany; zakupy 409; Radar, profile, admin, kontakty) | 56/56 |
| Tryb komercyjny (rejestracja klienta i ogłoszeniodawcy 201, zamówienie 201) | 6/6 |
| Płatności A–L (tryb komercyjny) | 64/64 |
| UI: `/register`, `?type=escort`, `?type=business` × DE/PL/EN × desktop/mobile | 18/18: 0 pól, 0 żądań rejestracji, CTA → Radar, bez przewijania w poziomie |
| Repozytorium / typecheck | 590/590, OK |

Zrzuty: `.artifacts/public-preview-003/`.

## 5. Testy akceptacyjne produkcji (dodatkowe do 002)

| # | Test | Oczekiwane |
|---|---|---|
| B1 | `GET /api/platform/status` | `registration_open: false` |
| B2 | `curl -X POST <API>/api/auth/register -H 'content-type: application/json' -d '{}'` | 403 `REGISTRATION_CLOSED` (pusty request — nie tworzy konta) |
| B3 | `/register`, `/register?type=escort` | ekran „wkrótce”, brak pól formularza |
| B4 | Logowanie istniejącym kontem | działa |
| B5 | `GET <supabase>/auth/v1/settings` po zmianie w Dashboardzie | `disable_signup: true` |

## 6. Wycofanie

Render → poprzedni deploy (`c57f3c8` lub `2825e6f`), Hostinger → poprzedni ZIP. Ustawienie Supabase „Allow new users to sign up” → ON
(tylko jeśli rejestracja ma działać). Brak migracji do cofnięcia.
