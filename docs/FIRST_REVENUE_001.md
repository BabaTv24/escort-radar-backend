# ER-V1-FIRST-REVENUE-001 — pierwsza płatność

Stan na 2026-11-12. Dokument nie zawiera sekretów ani danych bankowych.

## 1. Zakres

Sprzedawane są wyłącznie dwa produkty, płatne przelewem SEPA i weryfikowane ręcznie przez admina:

| Produkt | ID | Cena | Typ |
|---|---|---|---|
| Premium Listing (ogłoszeniodawca) | `advertiser_30d` | 49,99 EUR | 30 dni, odnawiane kolejnym zamówieniem |
| Premium klienta | `client_activation` | 0,99 EUR | jednorazowo |

Zamknięte (kod: `CUSTOMER_ORDER_PRODUCT_IDS`, `CUSTOMER_PAYMENT_PROVIDERS` w `Back/src/manualPayments.ts`): plan agencyjny / ESCORT Office Center, pakiety BC Coins, krypto, „manual”, CCBill, Paysafe. Historyczne zamówienia i księgowania pozostają bez zmian.

## 2. Przepływ

1. Klient (zalogowany, e-mail potwierdzony) otwiera `/pricing?product=…` i tworzy zamówienie.
2. Backend sprawdza: produkt dopuszczony, przelew skonfigurowany (odbiorca, IBAN, operator), uprawnienie
   (Premium jeszcze nieaktywne; dla 49,99 EUR konto ogłoszeniodawcy z profilem). Ponowne kliknięcie zwraca to samo otwarte zamówienie.
3. Klient widzi produkt, kwotę, odbiorcę, IBAN/BIC, operatora, unikalny tytuł przelewu `ER-{orderId}-{email}`, status „Oczekuje” i dalsze kroki.
4. Admin (Admin Control Center → Manuelle Zahlungsaufträge) zatwierdza **wyłącznie po sprawdzeniu wpływu na wyciągu bankowym**:
   wpisuje faktycznie otrzymaną kwotę (musi równać się kwocie zamówienia) i opcjonalnie identyfikator transakcji.
5. Backend blokuje zamówienie atomowo (`pending → paid`), nadaje uprawnienie dokładnie raz, zapisuje potwierdzenie i wpis w `admin_audit_log`.
6. Abonament: koniec liczony od najpóźniejszej ważnej daty (`premium_valid_until`, `subscription_end`, `subscription_expires_at`) + 30 dni;
   data jest przypięta do zamówienia, więc ponowienie nie przedłuża drugi raz. Po upływie daty konto traci dostęp ogłoszeniodawcy
   (`app_metadata.subscription_expires_at`), Business Center pokazuje „Abgelaufen”.
7. Widoczność publiczna profilu bez zmian: decyduje moderacja (`is_published`, `moderation_status`), nie abonament.

## 3. Testy DEV (konta syntetyczne, płatności symulowane)

64/64 kontroli (dwa przebiegi): A abonament, B Premium klienta, C podwójne i równoległe zatwierdzenie (6 równoległych → 1 zastosowanie),
D nieopłacone, E odrzucone, F odnowienie, G wygaśnięcie, H zachowanie istniejącego abonamentu, I klient nie zatwierdzi sam,
J zły produkt/metoda/kwota, K bezpieczna awaria (powrót do `pending`, odzysk porzuconej blokady), L spójność historii i metryk.
Repozytorium: 572/572 testów (`tests/firstRevenue.test.ts` nowy).

## 4. Wdrożenie (wymaga decyzji BOSS)

Zmiany obejmują backend i frontend; **muszą wejść razem** (nowy frontend wysyła potwierdzenie wpływu, którego wymaga nowy backend;
stary frontend z nowym backendem nie zatwierdzi zamówienia, nowy frontend ze starym backendem pokazuje tylko przelew).

1. Render: wdrożyć commit z gałęzi `feature/v1-p0-commercial-core` (bez migracji — schemat bez zmian).
2. Kontrola: `/api/version` = nowy commit; `/api/payments/manual-products` zwraca tylko `client_activation`, `advertiser_30d`, `bank_transfer: true`.
3. Hostinger: wgrać ZIP frontendu zbudowany z tego samego commita; `deploy-version.json` = ten commit.
4. Test produkcyjny bez pieniędzy: konto testowe tworzy zamówienie 0,99 EUR → widoczne dane przelewu → admin **odrzuca**.

Wycofanie: Render → Rollback do `2825e6f`; Hostinger → poprzedni pakiet `a26fe23`. Dane nie są migrowane, więc wycofanie jest bezpieczne.

## 5. Do wykonania przez BOSS

1. Potwierdzić, że konto bankowe (LT, odbiorca = operator) może przyjmować płatności za tę działalność (kontrakt V1, sekcja 12).
2. Uzupełnić dane prawne (Hostinger build env): `VITE_LEGAL_OPERATOR_ADDRESS`, `VITE_LEGAL_RESPONSIBLE_PERSON`, ew. `VITE_LEGAL_VAT_ID`
   — Impressum (§ 5 DDG) pokazuje dziś tylko nazwę operatora.
3. Zdecydować o pouczeniu o odstąpieniu (Widerrufsbelehrung) dla konsumentów i statusie VAT (ceny brutto) — wymaga porady prawnej.
4. Render (opcjonalnie, porządkowo): `MANUAL_CRYPTO_ENABLED=false`, `PAYMENT_DEFAULT_PROVIDER=bank_transfer` (kod i tak je blokuje).
5. Potwierdzić stan migracji 059/060 na produkcji przed obiecywaniem rezerwacji (kontrakt V1, blokada 9).
6. Ręcznie sprawdzać wyciąg; screenshot ani deklaracja klienta nie są potwierdzeniem płatności.

## 6. Oferta sprzedażowa (DE)

Wysyłać tylko pojedynczo, osobom, które same pytają lub wyraziły zgodę na kontakt. Bez masowych wiadomości, bez płatnych reklam.

### Escort-Radar Premium-Inserat — 49,99 EUR / 30 Tage

Mit dem Premium-Inserat präsentieren Sie Ihr Profil auf Escort-Radar und verwalten Anfragen in Ihrem persönlichen Business Center:

- Profil mit Fotos, Leistungen (DE/PL/EN), Preisen und Standort im Live-Radar und in der Stadtsuche — nach Prüfung durch unser Moderationsteam.
- Buchungsanfragen von Premium-Kunden empfangen, annehmen oder ablehnen.
- Nachrichten und Aktivitätsübersicht im Business Center.
- Persönlicher Empfehlungslink mit QR-Code.
- Laufzeit 30 Tage, keine automatische Verlängerung, kein Abo-Vertrag.

So buchen Sie:
1. Registrieren: https://escort-radar.fun/register?type=escort
2. E-Mail bestätigen und Profil im Business Center ausfüllen.
3. Premium bestellen: https://escort-radar.fun/pricing?product=advertiser_30d
4. Den angezeigten Betrag mit dem angegebenen Verwendungszweck überweisen.
5. Nach Prüfung des Zahlungseingangs wird Ihr Premium-Inserat aktiviert; Laufzeit und Enddatum sehen Sie im Business Center unter „Abo“.

**Kurznachricht:**
> Hallo! Escort-Radar ist live: Profil anlegen, Anfragen im Business Center verwalten, sichtbar im Live-Radar nach Moderation. Premium-Inserat 49,99 € für 30 Tage, ohne Abo-Falle. Registrierung: https://escort-radar.fun/register?type=escort

**FAQ — Wann ist mein Premium aktiv?**
Ihre Bestellung ist noch keine Zahlung. Wir aktivieren Premium, sobald Ihre Überweisung mit dem richtigen Verwendungszweck auf unserem Konto eingegangen ist und geprüft wurde. Eine SEPA-Überweisung braucht meist einen Bankarbeitstag. Bis dahin steht Ihre Bestellung auf „Ausstehend“. Einen Screenshot der Überweisung brauchen wir nicht. Fragen: support@escort-radar.fun.

Bez obietnic: brak gwarancji klientów, brak statystyk ruchu.
