# Escort Radar — instrukcje agenta produkcyjnego

## Cel i architektura

Projekt ma być szybko gotowy do stabilnej produkcji i monetyzacji. Frontend to Vite + React PWA na Hostingerze (`escort-radar.fun`), backend to Node + Express na Renderze, a Supabase obsługuje bazę, autoryzację i storage.

## Tryb pracy

- Polecenia „analiza”, „sprawdź”, „zdiagnozuj” oznaczają pracę bez modyfikacji.
- Polecenia „napraw”, „wdroż”, „zmień”, „zbuduj”, „zaimplementuj” oznaczają wykonanie minimalnego patcha, jego weryfikację i dostarczenie wymaganych artefaktów.
- Nie kończ zadania implementacyjnego samym planem lub analizą, chyba że istnieje konkretny bloker.
- Commit, push, deploy, migracja, upload lub budowa ZIP wymagają bezpośredniego polecenia właściciela.

## Zasady zmian

- Nie przepisuj całości, nie usuwaj działających funkcji i nie ruszaj niepowiązanych plików ani zmian użytkownika.
- Nie używaj localhost jako rozwiązania produkcyjnego.
- Zmiany bazy wykonuj wyłącznie przez migrację SQL i nigdy nie zgaduj struktury tabel.
- Stosuj minimalny patch, testuj proporcjonalnie do ryzyka i zachowuj istniejące API, dane, uprawnienia, routing oraz funkcje użytkowe.
- Nie dodawaj danych demonstracyjnych do kodu produkcyjnego. Fixture wizualne mogą działać tylko w testach albo przez Playwright route interception.

## Zmiany interfejsu

Przed zmianą UI przeczytaj:

1. `UI_IMPLEMENTATION_CONTRACT.md`;
2. odpowiednią specyfikację w `docs/ui/`;
3. przypisane do ekranu pliki w `Mockup/`.

Mockupy trzeba faktycznie otworzyć narzędziem do inspekcji obrazów. Nazwa pliku ani opis tekstowy nie oznaczają obejrzenia obrazu.

Mockup jest źródłem prawdy dla struktury, hierarchii, proporcji, kolorystyki, typografii, spacingu oraz wyglądu desktop i mobile. Istniejąca aplikacja jest źródłem prawdy dla danych, logiki, API, uprawnień, routingu i funkcji użytkowych. Nie wolno usuwać działających funkcji w celu dopasowania wyglądu.

Nie dopisuj przypadkowych warstw CSS override na końcu `styles.css`. Poprawiaj właściwe reguły i ograniczaj style do konkretnej strony lub komponentu.

Każde zadanie wizualne z poleceniem zmiany wymaga:

- implementacji;
- screenshotu desktop i mobile przy zoomie 100%;
- porównania z mockupem w tej samej skali;
- samodzielnego obejrzenia porównania;
- akceptacji właściciela przed commitem lub wdrożeniem.

Nie deklaruj zgodności 1:1 wyłącznie na podstawie testów lub builda.

## Raport

Każdy raport ma zawierać: problem, przyczynę, pliki zmienione, implementację, komendy, wdrożenie, sprawdzenie, checklistę produkcyjną i wycofanie.
