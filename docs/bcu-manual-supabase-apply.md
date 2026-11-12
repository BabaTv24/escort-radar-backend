# Ręczne uruchomienie BCU 043–045 w Supabase

1. Otwórz Supabase → SQL Editor → New query.
2. Otwórz `scripts/sql/bcu_043_045_manual_apply_package.sql`.
3. Skopiuj wyłącznie STEP 00.
4. Kliknij Run.
5. Jeśli wynik to `READY`, uruchom STEP 01.
6. Jeśli wynik to `STOP`, przerwij.
7. Kontynuuj dokładnie według STEP 02–08.
8. Po każdym STEP wyeksportuj wynik albo wykonaj zrzut ekranu.
9. Nie włączaj `BCU_WALLET_ENABLED`.
10. Nie testuj jeszcze prawdziwych płatności.

| Step | Oczekiwany wynik | Akcja |
|---|---|---|
| 00 | READY | uruchom 01 |
| 02 | PASS | uruchom 03 |
| 04 | PASS | uruchom 05 |
| 05 | READY | uruchom 06 |
| 07 | PASS | uruchom 08 |
| 08 | PASS | zakończ |

Każdy STEP uruchamiaj osobno. Nie zaznaczaj i nie uruchamiaj całego pliku. Migracje 043, 044 i 045 są oddzielnymi krokami i nie są objęte wspólnym `BEGIN/COMMIT`.
