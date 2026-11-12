# Dashboard reklamodawcy

## Trasa i komponent

- Trasa: `/dashboard` dla kont `escort` i `business`
- Komponent: `DashboardPage`, odpowiedni wariant reklamodawcy

## Brak zatwierdzonego mockupu

W katalogu `Mockup/` nie znaleziono obrazu jednoznacznie przedstawiającego dashboard reklamodawcy. Mockupy Private Client Office dotyczą konta klienta i nie mogą być automatycznie użyte jako kontrakt tego ekranu.

## Struktura, desktop i mobile

Do czasu dostarczenia mockupu źródłem prawdy pozostaje działający wariant `DashboardPage`. Zachować aktualne sekcje, role, dane, formularze, status profilu, plan, wallet, powiadomienia i działania publikacyjne.

Nie ustala się nowej struktury ani proporcji. Są do zatwierdzenia przez właściciela.

## Elementy obowiązkowe i funkcje do zachowania

- rozpoznanie roli `escort`/`business`;
- tworzenie i edycja profilu;
- status publikacji, moderacji, planu i dostępności;
- media, ceny, usługi, harmonogram i lokalizacja;
- wallet/subscription i rzeczywiste uprawnienia;
- powiadomienia, dane klientów i inne istniejące funkcje.

## Czego nie dodawać

- layoutu skopiowanego z dashboardu klienta bez zgody;
- fikcyjnych wyników, klientów, płatności lub statusów;
- nowych pól bez kontraktu API/migracji;
- funkcji panelu admina.

## Stany

Zachować istniejące loading, empty, error i locki planu/uprawnień. Dokładny wygląd jest do zatwierdzenia przez właściciela.

## Viewporty kontroli

- desktop `1440×900`;
- mobile `390×844`;
- formularze dodatkowo na szerokości `360px`.

## Checklista akceptacji

- [ ] Właściciel dostarczył lub zatwierdził mockup przed redesignem.
- [ ] Role i uprawnienia nie zostały naruszone.
- [ ] Formularze i publikacja działają.
- [ ] Brak danych demo.
- [ ] Brak overflow i clippingu.
- [ ] Stany danych zostały sprawdzone.
- [ ] Screenshoty desktop/mobile zostały obejrzane i zaakceptowane.
