# ESCORT-RADAR V1 — wiążący kontrakt biznesowy

Misja ER-V1-BUSINESS-CONTRACT-LOCK-005. Zasady zatwierdzone przez BOSS.

Ten dokument jest jedynym źródłem prawdy dla reguł biznesowych V1. Zastępuje wcześniejsze prompty, szkice i założenia tam, gdzie są z nim sprzeczne, w tym:
- płatną rezerwację (5 BC);
- płatne ulubione (5 BC);
- część stawek w `V1_DIGITAL_REVENUE_AND_VIDEO_REQUIREMENTS.md`.

Kolumna „Stan w kodzie” opisuje to, co zostało zweryfikowane na DEV. Pozycja oznaczona jako blokada **nie działa** i nie wolno jej przedstawiać jako działającej.

1 BC = 10 000 BCU. Każda operacja BC to jedna transakcja SQL z wpisami w `bcu_ledger_entries`. Historia finansowa nigdy nie jest kasowana ani przepisywana wstecz.

## 1. Klient FREE

| Reguła | Egzekwowanie (backend) | Stan |
|---|---|---|
| Podstawowy publiczny Radar i ograniczone profile | `GET /api/profiles` i `GET /api/profiles/:id`: sanitizer usuwa dane właściciela, adres i kontakty | działa |
| Tylko pierwsze autoryzowane zdjęcie | `PUBLIC_PROFILE_IMAGE_LIMIT = 1` w `sanitizePublicProfile` (lista i profil); tylko zdjęcia zatwierdzone, niepubliczne ukryte | działa |
| Brak chronionych zdjęć i telefonów | `GET /api/profiles/:id/access` → 403 bez aktywacji; `phone`, `primary_phone`, `additional_phones`, `business_phone`, `whatsapp`, `telegram` usuwane z widoku publicznego | działa |
| Brak rezerwacji | `POST /api/booking-requests` → 403 `CLIENT_ACTIVATION_REQUIRED`; funkcja SQL `create_booking_request` sprawdza aktywację drugi raz | działa |
| Brak czatu płatnego | `POST /api/sponsored/profiles/:id/chat` → 403 | działa |
| Brak wideoczatu | 409 `VIDEO_CHAT_NOT_AVAILABLE` dla wszystkich | działa (wideo wyłączone) |
| Brak prezentów i funkcji BC | `POST /api/gifts/:id` → 403; ulubione → 403 `PREMIUM_REQUIRED`; Communication Plus → 409 | działa |
| Brak osobistego kodu i QR polecającego | `GET /api/referrals/me` → 403 `REFERRAL_PREMIUM_REQUIRED`; podsumowanie aktywacji zwraca `referral_code`/`referral_link`/`qr_image_url` = null | działa |
| Brak nagród za polecenia | `activate_client_premium_bcu` nagradza tylko polecającego z `client_activated` | działa |

## 2. Klient PREMIUM

- Jednorazowa aktywacja: 0,99 EUR. Stan Premium = wiersz `client_activations.state = 'client_activated'`. Tworzą go:
  - webhook Stripe po zweryfikowanej płatności;
  - ręczna aktywacja w panelu admina (patrz blokady).
- Bonus powitalny: 7 BC (`premium_activation_bonus`, 70 000 BCU). Przyznawany raz, z kluczem `client-premium-bonus:<user>`. Funkcja odmawia bez ważnej aktywacji.
- Premium otrzymuje:
  - pełny dashboard klienta;
  - pełną zatwierdzoną galerię i dane kontaktowe (`/access`);
  - osobisty link i QR polecający;
  - prawo do nagród za polecenia;
  - bezpłatne rezerwacje;
  - opcjonalny płatny czat;
  - portfel BC;
  - opcjonalne prezenty (gdy BOSS zatwierdzi ceny).
- Zakup BC wyłącznie przez zatwierdzonego dostawcę płatności. Produkcyjne płatności pozostają zablokowane (sekcja 12). Nagroda nigdy nie jest przyznawana za niezweryfikowany zakup.

## 3. Ogłoszeniodawca

- Istniejący dashboard: profile, rezerwacje, czat i sterowanie AI, licznik aktywności, „Digitale Einnahmen”, portfel BC, osobisty link i QR polecający.
- Kod i QR polecający dostaje tylko konto z aktywną subskrypcją (`getAdvertiserAccess`).
- Zarobione BC mogą w przyszłości odnawiać subskrypcję. Dziś tego nie da się zrobić (sekcja 9). Istniejące produkty i ceny subskrypcji pozostają bez zmian.

## 4. Rezerwacja jest bezpłatna

- Zapytanie o rezerwację kosztuje **0 BC**. Może je wysłać tylko aktywowany klient Premium.
- Ścieżka: backend → `create_booking_request` (migracja 060):
  - blokada advisory;
  - idempotencja po (klient, profil, klucz);
  - te same kontrole profilu;
  - status `awaiting_owner_activation` dla profili sponsorowanych.
- Funkcja zwraca `{created, booking}`, dzięki czemu przy równoległej powtórce właściciel dostaje dokładnie jedno powiadomienie.
- Stara ścieżka płatna jest wyłączona:
  - `create_paid_booking_request` rzuca `PAID_BOOKING_DISABLED`;
  - produkt `profile_booking` ma `active = false`, więc `charge_bcu_profile_interaction('booking')` nie może pobrać opłaty.
- Bez zmian: tabele, maszyna stanów, kontrole własności, interfejsy klienta i ogłoszeniodawcy.
- Historyczne wpisy `booking_sent`/`booking_received` zostają w ledgerze. Panel przychodów pokazuje je osobno jako historyczne opłaty.

## 5. Czat tekstowy

- Opcjonalny; włącza go ogłoszeniodawca. Tylko aktywowany Premium.
- 3 BC jednorazowo na relację klient–profil: klient −3 BC, właściciel profilu +3 BC.
  - Klucz `chat:<klient>:<profil>`.
  - Wpisy `chat_sent`/`chat_received`.
- Kolejne wiadomości, odpowiedzi AI, przejęcie i oddanie rozmowy są bezpłatne.
- AI ujawnia się jako asystent i nie potwierdza terminów.

## 6. Wideoczat

- Opcjonalny, sterowany przez ogłoszeniodawcę, tylko Premium.
- Proponowana stawka: 7 BC za rozpoczętą, połączoną minutę.
- Rozliczenie po stronie serwera, dopiero po zestawieniu połączenia; połączenia nieodebrane lub nieudane są bezpłatne.
- **Dziś niedostępny.** Backend odrzuca (409) przed jakimkolwiek RPC, a `/access` zwraca `live_cam_enabled = VIDEO_CHAT_IMPLEMENTED = false`.
- Żadne naliczanie przed pełną implementacją, weryfikacją i akceptacją BOSS. Brakujące komponenty: `V1_DIGITAL_REVENUE_AND_VIDEO_REQUIREMENTS.md`, sekcja 2.

## 7. Ulubione i dobrowolne prezenty

- **Ulubione są bezpłatne** dla aktywowanego Premium.
  - `POST /api/favorites/:id` zapisuje relację (unikalna para klient–profil), nie wywołuje żadnej funkcji BC i zwraca `charged: false`.
  - Właściciel dostaje jedno anonimowe powiadomienie „New admirer”.
  - Produkt `favorite_profile` ma `active = false`. Serwis płatnych ulubionych został usunięty.
  - Historyczne `bcu_favorite_transfers` i wpisy `favorite_*` zostają.
- **Prezenty to osobna, dobrowolna operacja.** Poziomy Diamond I–V mają kody produktów `gift_diamond_1` … `gift_diamond_5` w `system_bcu_products`.
  - Ceny pochodzą wyłącznie z katalogu. **Żadna cena nie jest dziś skonfigurowana.** `GET /api/gifts/catalog` zwraca `configured: false`, a `POST /api/gifts/:id` zwraca 409 `GIFT_NOT_CONFIGURED` bez opłaty.
  - Po skonfigurowaniu aktywnego produktu `transfer` z ceną > 0 funkcja `send_bcu_profile_gift` w jednej transakcji:
    - pobiera BC od klienta Premium;
    - uznaje właściciela profilu;
    - zapisuje niezmienialną parę `gift_sent`/`gift_received`;
    - zapisuje wiersz w `bcu_profile_gifts`, który jest licznikiem prezentów profilu.
  - Klucz idempotencji pochodzi od klienta. Ponowne użycie klucza dla innego profilu lub poziomu kończy się błędem.
  - Backend wysyła właścicielowi anonimowe powiadomienie `gift_received`.
- Przyszły ranking oparty na prezentach musi być oznaczony jako płatna promocja. Obecny algorytm rankingu pozostaje bez zmian.

## 8. Ekonomia BC — obieg zamknięty

- BC to wewnętrzny kredyt platformy. Klient wydaje BC na czat, wideo (gdy powstanie), prezenty i inne zatwierdzone produkty. Ogłoszeniodawca — na odnowienie subskrypcji (gdy powstanie) i zatwierdzone produkty.
- Brak wymiany BC na EUR, wypłat, przelewów między użytkownikami, kryptowalut i rynku BC. W kodzie nie ma żadnego mechanizmu wypłaty.
- Wszystkie ruchy BC wykonuje wyłącznie backend przez funkcje SQL `security definer`, wykonywalne tylko przez `service_role`. Bezpośrednie wywołania przez PostgREST z kluczem anon lub tokenem użytkownika kończą się błędem 42501.

## 9. Odnowienie subskrypcji za BC

**Niedostępne.**
- Produkty `advertiser_30_days`, `small_business_30_days` i `vip_business_30_days` istnieją w katalogu, ale żaden endpoint ich nie sprzedaje. `/api/bcu/products/:code/activate` przyjmuje tylko `communication_plus` i tylko od klientów.
- `activate_bcu_product` wymaga `client_premium` dla produktów ogłoszeniodawcy, a dostęp ogłoszeniodawcy wynika z `app_metadata.subscription_status/plan` i `profiles.subscription_status`. Wpis w `user_entitlements` nie przedłuża więc realnej subskrypcji.
- Uruchomienie wymaga decyzji BOSS (patrz blokady).

## 10. Polecenia

- Kod i QR: tylko aktywowany Premium, ogłoszeniodawca z aktywną subskrypcją i admin. FREE nie dostaje kodu z API.
- Nagroda: istniejąca reguła 10 BC (`referral_reward`) dla polecającego, który jest aktywowanym klientem, przy aktywacji Premium poleconego.
  - Jedna nagroda na poleconego (unikalny indeks).
  - Bez samopoleceń.
  - Idempotencja klucza ledgera.
- Kwoty i reguły bez zmian do decyzji BOSS.

## 11. Communication Plus

Sprzedaż wyłączona (409). Historyczne zakupy i zapisy księgowe zostają. Produkt nie jest przedstawiany jako aktywna funkcja.

## 12. Zgodność z dostawcą płatności

- Opisanie zakupów jako „produkty cyfrowe” nie czyni modelu Escort Radar akceptowalnym dla Stripe.
- Rzeczywista działalność musi być zgłoszona dostawcy zgodnie z prawdą.
- Produkcyjne płatności pozostają zablokowane do potwierdzenia akceptacji. Nowy dostawca wymaga autoryzacji BOSS.

## 13. Otwarte blokady przed monetyzacją

1. Akceptacja dostawcy płatności (sekcja 12). Do tego czasu nie ma produkcyjnych zakupów Premium ani BC.
2. Ceny prezentów Diamond I–V: brak zatwierdzonych cen, więc prezenty są nieaktywne.
3. Odnowienie subskrypcji za BC: brak przelicznika, endpointu i powiązania z realną subskrypcją (sekcja 9).
4. Nagrody poleceń dla ogłoszeniodawców: kontrakt je przewiduje, a obecna funkcja SQL nagradza tylko polecającego z aktywacją klienta. Zmiana reguły wymaga decyzji BOSS i migracji.
5. Dwa znaczniki Premium:
   - backend V1 używa `client_activations`;
   - dashboard klienta w trybie BCU pokazuje Premium według uprawnienia `client_premium`.
   Na DEV istnieją konta z uprawnieniem `client_premium` bez aktywacji, więc UI pokazuje im Premium, a backend odmawia.
6. Ręczna aktywacja Premium przez admina omija weryfikację płatności. Potrzebna reguła operacyjna albo blokada.
7. Odwrócenie płatności (chargeback lub zwrot) nie cofa aktywacji ani nagrody za polecenie. Brak mechanizmu.
8. Wideoczat: brak implementacji (sekcja 6).
9. Migracje 058, 059 i 060 są zastosowane tylko na DEV. Produkcja wymaga osobnej decyzji wydania.
