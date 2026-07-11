# BCU 043–045 — staging deployment runbook

## Zasady wykonania

- Pakiet uruchamiaj wyłącznie na środowisku staging.
- Przed rozpoczęciem potwierdź aktualny backup i możliwość odtworzenia stagingowej bazy.
- Migracje wykonuj pojedynczo, dokładnie w podanej kolejności.
- W plikach walidacyjnych uruchamiaj każdy blok `SELECT` osobno.
- Zapisuj wynik każdego kroku w artefaktach wdrożenia.
- Po każdym kroku podejmij decyzję GO/STOP przed przejściem dalej.
- Podczas całego wdrożenia pozostaw `BCU_WALLET_ENABLED=false`.
- Nie uruchamiaj tego pakietu na produkcji.

## KROK 1

Uruchom:

`supabase/migrations/043_bcu_authoritative_wallet.sql`

### EXPECTED RESULT

- Powstają tabele `bcu_wallets`, `bcu_ledger_entries` i `bcu_migration_reconciliation`.
- Powstają indeksy, FK, CHECK constraints, RLS, polityki i immutable trigger.
- Powstają funkcje `bc_to_bcu`, `apply_bcu_ledger_entry` i `prevent_bcu_ledger_mutation`.
- Uprawnienia zapisu i wykonywania pozostają ograniczone do `service_role` zgodnie z migracją.
- Tabele legacy nie są modyfikowane ani migrowane automatycznie.

### SUCCESS RESULT

- Migracja kończy się bez błędu PostgreSQL.
- Transakcja migracji zostaje zatwierdzona w całości.
- Nie występują komunikaty o brakujących zależnościach lub konfliktujących obiektach.
- `BCU_WALLET_ENABLED=false`.

### STOP CONDITIONS

- Jakikolwiek błąd DDL, FK, CHECK, triggera, funkcji, RLS lub uprawnień.
- Istniejący obiekt ma inną definicję niż oczekiwana.
- Brakuje `auth.users`, tabel legacy, `set_updated_at` albo wymaganych capabilities PostgreSQL.
- Migracja zakończyła się częściowo lub nie można jednoznacznie potwierdzić statusu transakcji.

### ROLLBACK DECISION

- Jeżeli transakcja została wycofana automatycznie: nie wykonuj ręcznego czyszczenia; zachowaj błąd i przerwij wdrożenie.
- Jeżeli część zmian została zatwierdzona: NO-GO, nie uruchamiaj 044; odtwórz staging z backupu lub użyj zatwierdzonej procedury odtworzenia środowiska.
- Nie przygotowuj improwizowanego rollback SQL podczas okna wdrożeniowego.

## KROK 2

Uruchom:

`scripts/sql/bcu_043_validation.sql`

Każdy blok uruchom osobno.

### EXPECTED RESULT

- Wszystkie trzy relacje istnieją i mają włączone RLS.
- Raport zawiera wszystkie indeksy, FK i CHECK constraints z 043.
- Immutable trigger wskazuje `prevent_bcu_ledger_mutation` dla update/delete ledgeru.
- `apply_bcu_ledger_entry` ma `SECURITY DEFINER`, `search_path=public`, blokadę walletu i markery idempotency.
- `anon` i `authenticated` nie mają niedozwolonego EXECUTE.
- `service_role` ma wymagane uprawnienia.
- Kontrole danych zwracają zero nieprawidłowych walletów, kwot i relacji owner–wallet.

### SUCCESS RESULT

- Wszystkie wymagane obiekty i zabezpieczenia są obecne.
- Wszystkie FK i CHECK są zwalidowane.
- Wszystkie liczniki anomalii wynoszą `0`.
- Wyniki zostały zapisane w artefaktach stagingu.

### STOP CONDITIONS

- Brak tabeli, indeksu, FK, CHECK, polityki, triggera albo funkcji.
- RLS jest wyłączone.
- `anon` lub `authenticated` posiada niedozwolone EXECUTE.
- `service_role` nie posiada wymaganych uprawnień.
- Dowolny licznik spójności jest większy od zera.

### ROLLBACK DECISION

- Nie przechodź do 044.
- Jeżeli błąd dotyczy definicji 043, odtwórz staging do stanu sprzed KROKU 1 i popraw pakiet poza oknem wdrożeniowym.
- Jeżeli błąd dotyczy danych lub uprawnień środowiska, zachowaj bazę do analizy i oznacz release jako NO-GO.

## KROK 3

Uruchom:

`supabase/migrations/044_bcu_products_and_entitlements.sql`

### EXPECTED RESULT

- Powstają `system_bcu_products` i `user_entitlements`.
- Powstają indeksy, w tym unikalność jednego aktywnego entitlementu danego typu.
- Zostają zapisane dokładne produkty i ceny BCU.
- Powstają `has_active_user_entitlement` i `activate_bcu_product`.
- RLS, polityki i uprawnienia są zgodne z migracją.

### SUCCESS RESULT

- Migracja kończy się bez błędu.
- Wszystkie seedy produktów zostają zapisane z oczekiwanymi cenami, kierunkami i okresami.
- Nie występują konflikty FK do produktów ani zależności od 043.
- Feature flag pozostaje wyłączona.

### STOP CONDITIONS

- Brak obiektów z 043 lub niezgodna ich definicja.
- Błąd seedowania produktu, indeksu unikalnego, FK, funkcji, RLS lub uprawnień.
- Cena, operation type, entitlement type albo duration różni się od migracji.
- Nie można potwierdzić pełnego COMMIT migracji.

### ROLLBACK DECISION

- Jeżeli transakcja została wycofana: nie wykonuj 045; zachowaj diagnostykę.
- Jeżeli nastąpił częściowy COMMIT: NO-GO i odtworzenie stagingu z backupu.
- Nie zmieniaj ręcznie cen ani produktów w celu przepchnięcia walidacji.

## KROK 4

Uruchom:

`scripts/sql/bcu_044_validation.sql`

Każdy blok uruchom osobno.

### EXPECTED RESULT

- Obie tabele istnieją i mają RLS.
- Wszystkie produkty mają dokładne wartości z 044.
- Indeks aktywnych entitlementów jest unikalny i ma właściwy predicate.
- Funkcje posiadają prawidłowy security mode, search path, advisory lock i markery idempotency.
- Polityki i grants odpowiadają rolom.
- Nie ma duplikatów aktywnych entitlementów ani błędnych okresów.

### SUCCESS RESULT

- Każdy produkt ma `valid=true`.
- Kontrole duplikatów zwracają zero wierszy.
- Liczniki niespójnych okresów wynoszą `0`.
- EXECUTE jest zgodne z wymaganym modelem uprawnień.

### STOP CONDITIONS

- Brak lub niepoprawna cena któregokolwiek produktu.
- Brak unikalności aktywnego entitlementu.
- Brak advisory lock, idempotency albo wymaganych zabezpieczeń funkcji.
- Nieprawidłowe RLS/grants.
- Istnieją duplikaty lub nieprawidłowe okresy entitlementów.

### ROLLBACK DECISION

- Nie przechodź do 045.
- Zachowaj wyniki walidacji i oznacz release jako NO-GO.
- Przy błędzie definicji odtwórz staging i popraw migrację w osobnym cyklu review.

## KROK 5

Uruchom:

`supabase/migrations/045_client_premium_bcu_atomic.sql`

### EXPECTED RESULT

- Powstaje partial unique index dla granted activation referral rewards.
- Powstaje atomowe RPC `activate_client_premium_bcu`.
- RPC ma advisory lock, stabilne klucze idempotency, kontrolę aktywacji i konflikty semantyczne.
- EXECUTE jest odebrane rolom publicznym i przyznane `service_role`.
- Migracja nie nalicza bonusów ani referral — definiuje wyłącznie zabezpieczenia i RPC.

### SUCCESS RESULT

- Migracja kończy się pełnym COMMIT bez błędów.
- Preflight duplikatów nie wykrywa historycznych granted activation referral duplicates.
- Indeks i RPC powstają z oczekiwaną definicją.
- Feature flag nadal wynosi `false`.

### STOP CONDITIONS

- `CLIENT_REFERRAL_REWARD_DUPLICATES_REQUIRE_REVIEW`.
- Brak tabel lub produktów z 043/044.
- Konflikt indeksu, funkcji, typu kolumny lub uprawnień.
- Jakikolwiek błąd uniemożliwiający potwierdzenie pełnego COMMIT.

### ROLLBACK DECISION

- Przy wykryciu duplikatów: nie usuwaj ich automatycznie; zatrzymaj release i wykonaj manual review danych.
- Przy rollbacku transakcji: nie uruchamiaj walidacji funkcjonalnej jako dowodu sukcesu; release pozostaje NO-GO.
- Przy częściowym stanie: odtwórz staging z backupu.

## KROK 6

Uruchom:

`scripts/sql/bcu_045_validation.sql`

Każdy blok uruchom osobno.

### EXPECTED RESULT

- RPC ma `SECURITY DEFINER`, `search_path=public`, advisory lock i wszystkie markery ochronne.
- Referral unique index ma poprawny predicate.
- `client_rewards` jest zgodne typowo z 045.
- `anon` i `authenticated` nie mają EXECUTE, `service_role` ma EXECUTE.
- Nie ma duplikatów rewardów ani częściowych stanów bonus–entitlement.
- Stabilne klucze mają dokładne kwoty `70000` i `100000 BCU`.

### SUCCESS RESULT

- Wszystkie flagi bezpieczeństwa RPC są prawdziwe.
- Walidacja indeksu zwraca `valid=true`.
- Liczniki duplikatów, uszkodzonych referencji i częściowych stanów wynoszą `0`.
- Historyczne rewards bez referencji BCU są opisane jako historyczne, nie jako uszkodzone.

### STOP CONDITIONS

- Brak advisory lock, stabilnego klucza, conflict guard, security definer lub search path.
- Nieprawidłowe EXECUTE grants.
- Duplikat rewardu, uszkodzona referencja ledgeru lub częściowy bonus/entitlement.
- Nieprawidłowa kwota albo transaction type ledgeru.

### ROLLBACK DECISION

- Nie włączaj feature flagi.
- Oznacz release jako NO-GO i zachowaj staging do analizy.
- Jeżeli problem dotyczy definicji migracji, odtwórz staging i przygotuj poprawkę w nowym, zatwierdzonym cyklu migracyjnym.

## Testy funkcjonalne po KROKU 6

Przy nadal wyłączonej globalnej fladze wykonaj testy kontrolowane w zatwierdzonym środowisku testowym lub bezpośrednio przez uprawnioną ścieżkę service-role:

- pierwsza aktywacja Premium;
- retry tej samej aktywacji;
- retry tego samego webhooka;
- dwa równoległe requesty;
- referral z prawidłowym referrerem;
- self-referral i brak referrera;
- wallet, ledger, entitlement oraz `client_rewards` po każdej próbie.

Każdy test musi zostać zakończony ponownym uruchomieniem odpowiednich bloków walidacyjnych 043–045.

## Checklista release

- [ ] Migracja 043 OK.
- [ ] Walidacja 043 OK.
- [ ] Migracja 044 OK.
- [ ] Walidacja 044 OK.
- [ ] Migracja 045 OK.
- [ ] Walidacja 045 OK.
- [ ] Premium bonus: dokładnie jeden credit `70000 BCU`.
- [ ] Premium entitlement: dokładnie jeden aktywny `client_premium`.
- [ ] Referral: dokładnie jeden credit `100000 BCU` i jeden domenowy reward.
- [ ] Wallet: jeden wallet użytkownika, brak wartości ujemnych.
- [ ] Ledger: poprawne owner, amount, direction, type i idempotency key.
- [ ] Retry: brak dodatkowego bonusu, entitlementu i referral.
- [ ] Concurrent request: jeden wynik finansowy.
- [ ] RLS: wszystkie wymagane tabele chronione.
- [ ] RPC permissions: brak EXECUTE dla `anon`/`authenticated`, EXECUTE dla `service_role`.
- [ ] `BCU_WALLET_ENABLED=false`.

## GO / NO-GO

### GO do kontrolowanego włączenia flagi na stagingu

`BCU_WALLET_ENABLED=true` można włączyć wyłącznie na stagingu, gdy jednocześnie:

1. wszystkie kroki 1–6 zakończyły się sukcesem;
2. wszystkie wyniki walidacyjne zostały zachowane;
3. wszystkie liczniki duplikatów, częściowych stanów i uszkodzonych referencji wynoszą `0`;
4. ceny produktów są dokładne;
5. RLS oraz RPC permissions są prawidłowe;
6. pierwsza aktywacja, retry, webhook retry i concurrent request przeszły bez podwójnych zapisów;
7. wallet, ledger, entitlement, referral i domenowy reward są wzajemnie zgodne;
8. istnieje zatwierdzony plan obserwacji i szybkiego wyłączenia flagi;
9. Release Manager oraz właściciel backendu zatwierdzili wyniki stagingu.

### NO-GO

NO-GO obowiązuje przy dowolnym niespełnionym punkcie checklisty, błędzie migracji, anomalii danych, nieprawidłowym uprawnieniu albo niejednoznacznym wyniku retry/concurrency.

W przypadku NO-GO pozostaw `BCU_WALLET_ENABLED=false`. Samo pomyślne zastosowanie migracji nie jest zgodą na włączenie flagi.
