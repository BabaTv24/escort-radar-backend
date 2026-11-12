# Panel administracyjny

## Trasy i komponent

- Trasy: `/admin-access`, `/admin/login`, `/admin/*`
- Komponenty: `AdminAccessPage`, `AdminPage`

## Brak zatwierdzonego mockupu

W katalogu `Mockup/` nie znaleziono obrazu jednoznacznie przedstawiającego panel administracyjny. Materiały Private Client Office nie są mockupami admina.

## Struktura, desktop i mobile

Do czasu dostarczenia mockupu źródłem prawdy pozostaje działający panel. Nie definiuje się nowej hierarchii, gridu ani wyglądu. Panel ma przede wszystkim zachować czytelność, bezpieczeństwo i kompletność operacji.

## Elementy obowiązkowe i funkcje do zachowania

- bezpieczne logowanie i kontrola roli;
- istniejąca nawigacja i wszystkie moduły;
- profile, klienci, płatności/transakcje, moderacja i konfiguracja;
- statusy, filtry, wyszukiwanie, paginacja i operacje administracyjne;
- potwierdzenia operacji ryzykownych i komunikaty błędów;
- audytowalność tam, gdzie już istnieje.

## Czego nie dodawać

- fikcyjnych statystyk lub danych;
- funkcji administracyjnej bez backendowego uprawnienia;
- automatycznych destrukcyjnych akcji;
- wyglądu klientowskiego dashboardu jako domniemanego mockupu admina.

## Stany

- Loading nie może sugerować zakończenia operacji.
- Empty rozróżnia brak wyników od błędu.
- Error pokazuje bezpieczny komunikat i możliwość ponowienia.
- Brak uprawnień blokuje zawartość i nie ujawnia danych.
- Premium lock nie dotyczy admina, chyba że właściciel zdefiniuje odrębny przypadek.

## Viewporty kontroli

- desktop `1440×900`;
- mobile `390×844` tylko dla funkcji obecnie wspieranych;
- szerokie tabele dodatkowo przy `1280px`.

## Checklista akceptacji

- [ ] Właściciel dostarczył lub zatwierdził mockup przed redesignem.
- [ ] Kontrola roli i logowanie działają.
- [ ] Żaden moduł ani operacja nie zniknęły.
- [ ] Tabele i formularze nie mają clippingu.
- [ ] Empty/error/loading rozróżniają stan systemu.
- [ ] Brak danych demo.
- [ ] Screenshoty wspieranych viewportów obejrzano i zaakceptowano.
