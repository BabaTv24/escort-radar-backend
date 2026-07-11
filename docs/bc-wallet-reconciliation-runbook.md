# BC Wallet Reconciliation Runbook

## 1. Cel

Ten raport sluzy wylacznie do diagnostyki dwoch historycznych systemow walletow Escort Radar:

- legacy `wallets` / `token_transactions`,
- nowszego `coin_wallets` / `coin_transactions`.

Raport niczego nie migruje, niczego nie naprawia, niczego nie usuwa i nie tworzy nowego walleta BCU. Wyniki maja pomoc ustalic, ktore dane mozna bezpiecznie przeniesc do przyszlego modelu BCU.

## 2. Warunki Przed Uruchomieniem

- Potwierdz aktualny backup Supabase albo wykonaj backup przed analiza.
- Uruchamiaj zapytania tylko w SQL Editor wlasciwego projektu Escort Radar.
- Upewnij sie, ze projekt to produkcyjny lub wskazany do audytu projekt Escort Radar, a nie inna instancja.
- Nie uruchamiaj migracji produkcyjnych podczas tej analizy.
- Nie uruchamiaj zadnych zapytan spoza pliku `scripts/sql/bc_wallet_reconciliation_readonly.sql`.
- Nie kopiuj wynikow z danymi osobowymi do publicznych kanalow.
- Wyniki przekazuj jako agregaty oraz zanonimizowane probki.

## 3. Kolejnosc Blokow

Uruchamiaj bloki pojedynczo, nie caly plik naraz.

1. `BLOCK 00: schema sanity checks`
2. `BLOCK 00B: row counts`
3. `BLOCK 01: wallet counts and overlap aggregate`
4. `BLOCK 02: balance comparison samples`
5. `BLOCK 03A` i `BLOCK 03B`: rekonstrukcja sald z ledgerow
6. `BLOCK 04`: realne typy transakcji i zakresy kwot
7. `BLOCK 05`: kandydaci podwojnego kredytowania
8. `BLOCK 06`: bonusy i referral
9. `BLOCK 07`: favorites i gifts
10. `BLOCK 08`: subskrypcje i zrodla platnosci
11. `BLOCK 09`: anomalie walletow i transakcji
12. `BLOCK 10`: mapa jednostek

Najpierw zapisz wyniki agregatow. Dopiero potem kopiuj probki szczegolowe z blokow z limitem.

## 4. Kiedy Przerwac

Przerwij analize i nie uruchamiaj dalszych blokow, jezeli:

- brakuje kluczowej tabeli w `BLOCK 00`,
- typy kolumn roznia sie od repo,
- zapytanie zwraca blad castowania,
- zapytanie wykonuje sie bardzo wolno,
- wynik ujawnia pelne dane osobowe,
- liczby sa nielogiczne, np. ekstremalne salda lub row counts niezgodne z oczekiwaniem,
- produkcja ma migracje inne niz repo,
- ktorykolwiek blok wymaga recznej zmiany SQL przed uruchomieniem.

## 5. Jak Przekazac Wyniki

Nie przekazuj:

- pelnych UUID,
- e-maili,
- nazw uzytkownikow,
- danych Stripe,
- pelnych metadata,
- payment intentow,
- adresow,
- numerow telefonu,
- tresci wiadomosci.

Dla kazdego bloku przekaz wynik w tym formacie:

```text
Block:
Executed:
Row count:
Main totals:
Warnings:
Anonymized sample:
```

Jezeli blok zwraca kandydatow do manualnego review, traktuj ich jako kandydatow, nie jako pewne bledy lub duplikaty.

## 6. Decyzje Po Raporcie

Po analizie wynikow trzeba zdecydowac:

- ktore saldo jest zrodlem prawdy per user,
- jak deduplikowac zakupy kredytowane w obu systemach,
- jak konwertowac legacy jednostki do BCU,
- czy potrzebna jest manual review queue,
- czy wybrac Strategy C, czyli nowy BCU wallet z reconciliation,
- czy potrzebny jest okres dual-read lub read fallback,
- czy Stripe/manual payment credits byly zapisywane w obu walletach,
- jak obsluzyc konflikty salda przed migracja fundamentu BCU.

Do czasu zatwierdzenia tych decyzji nie wdrazaj migracji BCU, entitlementow ani nowych RPC walletowych.
