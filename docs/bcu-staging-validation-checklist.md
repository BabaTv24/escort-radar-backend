# BCU 043–045 staging validation checklist

Wszystkie migracje i skrypty walidacyjne uruchamiaj wyłącznie na stagingu, pojedynczo i w podanej kolejności.

- [ ] Uruchom `043_bcu_authoritative_wallet.sql`.
- [ ] Uruchom osobno wszystkie bloki `scripts/sql/bcu_043_validation.sql`.
- [ ] Uruchom `044_bcu_products_and_entitlements.sql`.
- [ ] Uruchom osobno wszystkie bloki `scripts/sql/bcu_044_validation.sql`.
- [ ] Uruchom `045_client_premium_bcu_atomic.sql`.
- [ ] Uruchom osobno wszystkie bloki `scripts/sql/bcu_045_validation.sql`.
- [ ] Wykonaj test aktywacji Client Premium.
- [ ] Wykonaj retry tej samej aktywacji.
- [ ] Wykonaj retry tego samego webhooka.
- [ ] Wykonaj dwa równoległe requesty aktywacji.
- [ ] Sprawdź dokładnie jeden referral reward `100000 BCU`.
- [ ] Sprawdź dokładnie jeden aktywny entitlement `client_premium`.
- [ ] Sprawdź ledger: jeden bonus `70000 BCU`, stabilne klucze i brak częściowych wpisów.
- [ ] Sprawdź wallet: saldo, lifetime credit/debit, owner i brak wartości ujemnych.
- [ ] Potwierdź brak uprawnień EXECUTE dla `anon` i `authenticated`.
- [ ] Potwierdź uprawnienie EXECUTE wyłącznie dla `service_role`.
- [ ] Pozostaw `BCU_WALLET_ENABLED=false`.

## Kryterium zakończenia

Nie przechodź dalej, jeśli którykolwiek skrypt zwraca brak obiektu, niewłaściwy typ, brak RLS, niepoprawne uprawnienia, duplikat lub częściowy stan. Nie włączaj feature flagi w ramach tej checklisty.
