# Homepage

## Trasa i komponent

- Trasa: `/`
- Komponent: `HomePage`

## Brak zatwierdzonego mockupu

W katalogu `Mockup/` nie ma kompletnego obrazu jednoznacznie przedstawiającego homepage aplikacji. Poniższe grafiki są materiałem brandingowym, nie kontraktem layoutu:

![Grafika miast i brandingu](../../Mockup/Escort-City-Logo.png)

![Poziomy logotyp](../../Mockup/escort-radar-fun_Schrift1.png)

![Piętrowy logotyp](../../Mockup/escort-radar-fun_Schrift2.png)

Nie wolno rekonstruować homepage na podstawie samego brandingu ani przenosić layoutu klientowskiego dashboardu na `/`.

## Struktura

Do czasu zatwierdzenia mockupu źródłem prawdy pozostaje działający `HomePage`: header/layout, hero, akcje, sekcje profili, Live Radar i footer.

## Desktop i mobile

- Zachować istniejące funkcje, kolejność danych, routing i responsywność.
- Nie zmieniać globalnej szerokości ani headera w ramach pracy nad innym ekranem.
- Nowy wygląd homepage wymaga osobnego mockupu i polecenia właściciela.

## Elementy obowiązkowe

- istniejące CTA i trasy;
- publiczne profile ze wspólnego źródła;
- Live Radar;
- loading, empty i error;
- header i footer.

## Czego nie dodawać

- układu wymyślonego z assetów brandingowych;
- demo profili;
- elementów dashboardu klienta;
- globalnych zmian wynikających z korekty Radaru lub profilu.

## Stany

Zachować działające loading, empty i error. Premium lock stosować tylko tam, gdzie wynika z istniejącej logiki.

## Viewporty kontroli

- desktop `1440×900`;
- mobile `390×844`;
- kontrola regresji przed/po każdej zmianie globalnego layoutu.

## Checklista akceptacji

- [ ] Istniejące funkcje i dane pozostały dostępne.
- [ ] Brak regresji względem screenshotu przed zmianą.
- [ ] Brak poziomego overflow.
- [ ] Header, Live Radar i footer działają.
- [ ] Brak danych demo.
- [ ] Nowy kierunek wizualny ma zatwierdzony mockup właściciela.
