# ER-V1-PUBLIC-PREVIEW-002 — finalna bramka bezpieczeństwa i wydanie

Gałąź `feature/v1-public-preview`. Bazuje na `ff265d2` (PUBLIC-PREVIEW-001). Bez sekretów i bez danych kontaktowych.
Commit wydania i SHA-256 ZIP-a: w raporcie końcowym (ten dokument jest częścią commita).

## 1. P0 — kontakty w publicznych opisach

- `Back/src/publicContactRedaction.ts` maskuje w danych publicznych (`[…]`): numery z `+`/`00` (8–15 cyfr) i z wiodącym `0` (9–14 cyfr),
  ciągi 9–15 cyfr tylko w sąsiedztwie słowa kontaktowego (Tel., Handy, WhatsApp, numer…), e-maile, linki komunikatorów,
  `@uchwyty` oraz `Telegram:/Snapchat:/Instagram: nazwa`. Ceny, wzrost, godziny, daty, kody pocztowe i „kontakt przez WhatsApp” bez numeru zostają.
- Pola: `display_name`, `description`, `availability_note`, `about`, `bio`, `tagline`, `headline`, `service_menu[].note|name`, `availability_hours.note`.
- Jedno miejsce: `sanitizePublicProfile` → lista, Radar, profil. **Nowo zamknięta luka:** `GET /api/favorites` zwracał surowy wiersz profilu
  (telefony, `owner_email`, `user_id`, adres, notatki admina) — teraz ten sam publiczny payload.
- Baza bez zmian; właściciel (`/api/profiles/me`) i admin widzą oryginał; Premium dostaje kontakty przez `/api/profiles/:id/access` jak dotąd.
- Weryfikacja na 321 publicznych opisach produkcji (odczyt publicznego API, lokalnie): zmienionych 7 — wszystkie 6 znanych przypadków
  i 1 dodatkowy uchwyt Telegram (`97ac9874…`, pisownia „Telgram”); 0 zmian w pozostałych 314; niezależny detektor: 0 trafień po maskowaniu.

## 2. P1 — prywatność analityki

Szczegóły i projekt sekcji Datenschutzerklärung: `docs/ANALYTICS_PRIVACY.md`.
- `ANALYTICS_COLLECTION_ENABLED` (brak = wyłączone): kolektor nic nie parsuje ani nie zapisuje; frontend nic nie wysyła; dashboard działa.
- Adres klienta tylko z pozycji zaufanego proxy w `X-Forwarded-For` (`ANALYTICS_TRUSTED_PROXY_HOPS`, domyślnie 1); `cf-connecting-ip` tylko po konfiguracji.
- Limity: 120 zdarzeń/10 min/pseudonim, 300/10 min/adres, maks. 5 pseudonimów na adres dziennie.
- `profile_view` bez pseudonimu, czas zaokrąglony do godziny (ograniczenie w bazie). Retencja 60 dni; czyszczenie co 6 h niezależnie od flagi.

## 3. Konfiguracja produkcyjna (Render)

| Zmienna | Wartość |
|---|---|
| `COMMERCIAL_OPERATIONS_ENABLED` | **nie ustawiać** (brak = `false`) |
| `ANALYTICS_COLLECTION_ENABLED` | **nie ustawiać** (brak = `false`) do akceptacji prawnej |
| `ANALYTICS_TRUSTED_PROXY_HOPS` | nie ustawiać (domyślnie 1); zweryfikować przed włączeniem analityki |

## 4. Kolejność wdrożenia (po akceptacji BOSS)

1. **Kopia:** potwierdzić aktualny backup Supabase; zapisać `GET /api/version` i liczbę profili Radar (`/api/profiles?radar=1`).
2. **Supabase — migracja 062:** SQL Editor → wkleić i wykonać `supabase/migrations/062_traffic_analytics.sql` (jednorazowo, idempotentna).
   Następnie `supabase migration repair --status applied 062`. **Nie używać `supabase db push`** — historia migracji produkcji jest
   niespójna (059/060 niezastosowane), `db push` wykonałby je razem z 062.
   Kontrola: `select to_regclass('public.traffic_events'), to_regclass('public.traffic_salts');` → obie tabele istnieją.
3. **Render:** wdrożyć commit wydania z gałęzi `feature/v1-public-preview` (Deploy specific commit). Bez merge do `main`.
4. **Hostinger:** wgrać zawartość ZIP-a zbudowanego z tego samego commita do `public_html` (z `.htaccess`), nadpisując pliki.

## 5. Testy akceptacyjne produkcji (tylko odczyt, bez płatności)

| # | Test | Oczekiwane |
|---|---|---|
| A1 | `GET /api/version` | `commit` = commit wydania |
| A2 | `GET https://escort-radar.fun/deploy-version.json` | `shortSha` = commit wydania |
| A3 | `GET /api/platform/status` | `public_preview`, `commercial_operations_enabled:false`, `analytics_enabled:false` |
| A4 | `GET /api/payments/manual-products` | `products: []` |
| A5 | `node scripts/publicContactScan.mjs` | `profiles_with_contact_exposure: 0`, `failed: 0`, liczba profili = zapisana w kroku 1 |
| A6 | Strona główna, Radar, miasto, profil (anonimowo) | działa; 1 zdjęcie; brak telefonu; opis z `[…]` dla 7 profili |
| A7 | `/register?type=escort` | „Registrierung für Inserenten startet in Kürze.”, opcja nieaktywna |
| A8 | `/pricing` | komunikat o podglądzie, brak przycisku zamówienia |
| A9 | Admin → Traffic Intelligence | ładuje się, odznaka „Erfassung deaktiviert” |
| A10 | Admin → Profile / Moderacja | działa jak dotąd |
| A11 | Istniejące konto Premium (jeśli jest) | galeria i kontakty dostępne |

Rejestracji `escort` nie testować na produkcji formularzem z prawdziwym adresem — blokada jest pokryta testami DEV.

## 6. Wycofanie

1. Render → Rollback do poprzedniego wdrożenia (obecnie `2825e6f`).
2. Hostinger → poprzedni pakiet (`escort-radar-front-a26fe23-premium-ui-polish-hostinger-20261112T175824Z.zip`).
3. Migracja 062 może zostać (nieużywane tabele). Pełne usunięcie, tylko na polecenie BOSS:
   `drop function if exists public.traffic_summary(integer); drop function if exists public.prune_traffic_analytics(integer); drop table if exists public.traffic_events, public.traffic_salts;`
Wycofanie przywraca też wcześniejsze zachowanie publicznych opisów i ulubionych (wraz z ujawnieniem kontaktów).

## 7. Znane ryzyka poza zakresem

- Produkcja działa już na kodzie gałęzi feature (`2825e6f`), a migracje 059/060 nie są zastosowane — dotyczy rezerwacji/czatu, nie tego wydania.
- Kraj w analityce dostępny tylko, jeśli Render przekazuje nagłówek kraju.
