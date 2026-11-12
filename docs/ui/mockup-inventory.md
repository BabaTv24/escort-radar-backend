# Inwentaryzacja mockupów

Wszystkie poniższe obrazy zostały otwarte i obejrzane 2026-07-28. Priorytet określa rolę w implementacji UI: `P0` — nadrzędny mockup ekranu, `P1` — system lub uzupełniający widok, `P2` — branding/marketing.

| Plik | Rozmiar obrazu | Ekran/funkcja | Desktop/mobile | Priorytet | Powiązana trasa | Powiązana specyfikacja |
|---|---:|---|---|---|---|---|
| `Escort-City-Logo.png` | 1254×1254 | grafika miast/branding, nie kompletny ekran | asset | P2 | brak jednoznacznej | [homepage](homepage.md) |
| `escort-radar-fun_Schrift1.png` | 1672×941 | poziomy logotyp słowny | asset | P2 | globalny branding | [homepage](homepage.md) |
| `escort-radar-fun_Schrift2.png` | 1672×941 | piętrowy logotyp słowny | asset | P2 | globalny branding | [homepage](homepage.md) |
| `Generated Image June 09, 2026 - 3_35PM.png` | 1152×896 | kreacja promocyjna Radaru | desktop/marketing | P2 | brak; materiał marketingowy | [radar](radar.md) |
| `Klient_Dashbord.png` | 737×488 | landing Private Client Office + dashboard klienta | desktop | P0 | `/dashboard` (`client`) | [dashboard klienta](dashboard-client.md) |
| `Klient_Radar.png` | 746×358 | Radar i profil obok siebie | desktop | P0 | `/city/:city`, `/profile/:id` | [radar](radar.md), [profil](profile.md) |
| `Mockup_All.png` | 941×1672 | zbiorcza plansza systemu i ekranów | desktop + mobile | P1 | wiele tras | [kontrakt](../../UI_IMPLEMENTATION_CONTRACT.md) |
| `Mockup_All_Design_System.png` | 751×265 | kolory, typografia, komponenty, spacing, radiusy, cienie | system | P0 | globalny UI | [kontrakt](../../UI_IMPLEMENTATION_CONTRACT.md) |
| `Mockup_All_Forms_Setings.png` | 256×274 | formularz ustawień i stany walidacji | desktop | P1 | `/dashboard` | [dashboard klienta](dashboard-client.md) |
| `Mockup_All_List_Cards_Layouts.png` | 171×271 | listy i karty profili/favorites | desktop | P1 | `/dashboard`, `/profile/:id` | [dashboard klienta](dashboard-client.md), [profil](profile.md) |
| `Mockup_All_Microinteractions_Motion.png` | 746×119 | hover, aktywny filtr, button press, shimmer, sukces | system | P1 | globalny UI | [kontrakt](../../UI_IMPLEMENTATION_CONTRACT.md) |
| `Mockup_All_Modals_Side_Panels.png` | 299×268 | rezerwacja i zakup kredytów | desktop | P1 | `/profile/:id`, `/coins` | [profil](profile.md), [dashboard klienta](dashboard-client.md) |
| `Mockup_All_Profile_Page.png` | 422×343 | profil publiczny | desktop | P0 | `/profile/:id` | [profil](profile.md) |
| `Mockup_All_PWA_MOBILE.png` | 155×1667 | dashboard, Radar, profil, wiadomości, wallet, menu | mobile | P0 | `/dashboard`, `/city/:city`, `/profile/:id`, `/coins` | [radar](radar.md), [profil](profile.md), [dashboard klienta](dashboard-client.md) |
| `Mockup_All_Radar.png` | 319×348 | Radar Search | desktop | P0 | `/city/:city` | [radar](radar.md) |
| `Mockup_All_States_Feedback.png` | 743×156 | empty/loading/hover/active/disabled/shimmer/badges | system | P1 | globalny UI | [kontrakt](../../UI_IMPLEMENTATION_CONTRACT.md) |
| `Mockup_Dashboard_Premium.png` | 742×490 | Private Client Office + dashboard premium | desktop | P0 | `/dashboard` (`client`) | [dashboard klienta](dashboard-client.md) |
| `Radar.png` | 322×348 | Radar Search | desktop | P0 | `/city/:city` | [radar](radar.md) |

## Ustalenia

- Nie znaleziono zatwierdzonego, kompletnego mockupu homepage `/`.
- Nie znaleziono zatwierdzonego mockupu dashboardu reklamodawcy (`escort`/`business`).
- Nie znaleziono zatwierdzonego mockupu panelu `/admin/*`.
- Grafiki brandingowe i promocyjne nie są samodzielnie kontraktem layoutu strony.
