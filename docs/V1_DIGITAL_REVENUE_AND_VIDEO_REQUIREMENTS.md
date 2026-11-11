# Escort-Radar V1: przychody cyfrowe i wideoczat płatny za minutę

Misja ER-V1-CORE-003. Dokument zapisuje zweryfikowane kontrakty BC z kodu i migracji oraz wymagania dla wideoczatu. Wideoczat **nie jest zaimplementowany** i nie może pobierać BC.

## 1. Zweryfikowane kontrakty BC

1 BC = 10 000 BCU. Każda opłata to jedna transakcja SQL z parą wpisów w `bcu_ledger_entries`:
- debet u klienta;
- kredyt u właściciela profilu.

| Interakcja | Kwota | Funkcja SQL | Klucz idempotencji | Typy w ledgerze | Odbiorca |
|---|---|---|---|---|---|
| Ulubione (pierwsze dodanie) | 5 BC | `add_bcu_favorite_with_transfer` (046) | `favorite:{client}:{profile}`; unikalna para w `bcu_favorite_transfers` | `favorite_sent` / `favorite_received` | właściciel profilu |
| Odblokowanie czatu | 3 BC | `start_paid_profile_chat` → `charge_bcu_profile_interaction` (052/059) | `chat:{client}:{profile}` | `chat_sent` / `chat_received` | właściciel profilu |
| Zapytanie o rezerwację | 5 BC | `create_paid_booking_request` → `charge_bcu_profile_interaction` | `booking:{client}:{profile}:{key}` | `booking_sent` / `booking_received` | **właściciel profilu** |
| Wideoczat | — | blokada w backendzie (`VIDEO_CHAT_IMPLEMENTED = false`), 409 przed jakimkolwiek RPC | — | — | — |
| Communication Plus | 100 BC | `purchase_communication_plus` (055) | — | — | sprzedaż wyłączona (409) |

**Ustalenia:**
- Opłata za rezerwację trafia dziś do ogłoszeniodawcy (`booking_received`). Panel „Digitale Einnahmen” pokazuje ją osobno i nie wlicza jej do przychodów cyfrowych. Podział tej opłaty pozostaje bez zmian i czeka na decyzję BOSS.
- Ulubione wymagają uprawnienia `client_premium`. Czat i rezerwacja wymagają dodatkowo wiersza `client_activations` w stanie `client_activated`. To dwa różne kontrakty aktywacji.
- Communication Plus to dziś bezterminowe uprawnienie bez żadnej korzyści: nie korzystają z niego czat, wideo ani rezerwacja. Historyczne zakupy zostają zachowane. Możliwe kierunki to pakiet kredytu komunikacyjnego, pakiet dodatkowych korzyści albo wycofanie produktu. Wybór należy do BOSS.
- W kodzie nie ma mechanizmu wypłaty ani wymiany BC na gotówkę. Zarobionych BC nie wolno przedstawiać jako możliwych do wypłaty.
- Aktywacja Premium (0,99 EUR) daje bonus 7 BC (`premium_activation_bonus`, 70 000 BCU, idempotentnie). Kod mapuje 0,99 EUR na aktywację klienta.
- Publiczny `GET /api/profiles/:id` zwraca do 4 publicznych, zatwierdzonych zdjęć także osobom niezalogowanym. Zdjęcia prywatne wymagają `/access` oraz VIP unlock. Wymóg „jedno zdjęcie dla nieaktywowanych” nie jest spełniony. Zmiana wpływa na publiczne strony i SEO, więc czeka na decyzję BOSS.

## 2. Wideoczat płatny za minutę: wymagania (do akceptacji BOSS)

**Stawka:** proponowane domyślne 7 BC/min. Stawka ma się znaleźć w `system_bcu_products` (np. `profile_video_minute`), a nie w kodzie. Obecny produkt `profile_videochat` (jednorazowe 7 BC) jest nieaktywny w praktyce, bo blokuje go backend.

**Przebieg sesji:**
1. Ogłoszeniodawca włącza wideoczat (`video_chat_enabled`). Dziś zapis `true` zwraca 409.
2. Klient z Premium widzi cenę za minutę i akceptuje zasady rozliczenia.
3. Klient wysyła zaproszenie. Ogłoszeniodawca akceptuje albo odrzuca.
4. Naliczanie startuje dopiero po potwierdzonym połączeniu mediów, potwierdzonym przez serwer, a nie przez przeglądarkę.
5. Każda rozpoczęta minuta to jedna para debet/kredyt z kluczem `video:{session}:{minute_index}`.
6. Przed każdą kolejną minutą serwer sprawdza dostępne saldo (saldo minus zablokowane). Przy braku środków sesja kończy się bezpiecznie.
7. Każda strona może zakończyć sesję. Po zakończeniu opłaty ustają.
8. Na koniec następuje uzgodnienie z ledgerem: liczba minut = liczba par wpisów.

**Bez opłat:** odrzucone i nieodebrane połączenia, nieudane zestawienie połączenia, czas przed połączeniem mediów, czas po zakończeniu sesji, przerwy w połączeniu (heartbeat obu stron; minuta bez heartbeatu nie jest naliczana).

### Brakujące komponenty

| Komponent | Stan |
|---|---|
| Sygnalizacja WebRTC (zaproszenie / akceptacja / SDP / ICE) | brak |
| Serwer TURN/STUN | brak; to płatna infrastruktura, wymaga autoryzacji |
| Tabela sesji wideo (stany: requested, accepted, connected, ended) i heartbeat | brak, potrzebna migracja |
| Funkcja SQL naliczająca minutę (blokada, idempotencja, kontrola salda) | brak, potrzebna migracja |
| Zegar po stronie serwera i zamykanie sesji bez heartbeatu | brak |
| UI: zaproszenie, akceptacja, status, czas, koszt, pozostałe saldo, zakończenie, zgłoszenie | brak |
| Moderacja, zgłaszanie, weryfikacja pełnoletności | do zdefiniowania |
| Nagrywanie | zakazane bez wyraźnej zgody i podstawy prawnej |

**Komponenty do ponownego użycia:**
- `charge_bcu_profile_interaction`: wzorzec blokady i pary w ledgerze;
- `profile_communication_settings.video_chat_enabled`;
- `radar_notifications`;
- przełącznik wideo w sekcji Wiadomości (dziś zablokowany).
