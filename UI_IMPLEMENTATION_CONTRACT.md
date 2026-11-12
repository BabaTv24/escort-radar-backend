# Escort Radar — kontrakt implementacji UI

## Cel

Ten dokument definiuje wspólny kontrakt wizualny. Nie zastępuje specyfikacji ekranów w `docs/ui/` ani logiki aplikacji.

## Hierarchia źródeł prawdy

1. Bieżące, jawne polecenie właściciela.
2. Mockup przypisany do ekranu — wygląd, struktura, hierarchia i proporcje.
3. Odpowiednia specyfikacja w `docs/ui/`.
4. Ten kontrakt — zasady wspólne.
5. Istniejąca aplikacja — dane, logika, API, uprawnienia, routing i działające funkcje.

Sprzeczność wizualną rozstrzyga mockup. Sprzeczność funkcjonalną rozstrzyga działająca aplikacja i jej kontrakty. Nie wolno usuwać funkcji tylko dlatego, że nie pokazano ich na jednym kadrze; należy znaleźć zgodne miejsce lub stan.

## Mapowanie ekranów

| Ekran | Trasa/obszar | Główne źródła |
|---|---|---|
| Radar | `/city/:city`, `RadarPanel` | `Mockup/Mockup_All_Radar.png`, `Mockup/Radar.png`, `Mockup/Mockup_All_PWA_MOBILE.png` |
| Profil | `/profile/:id` | `Mockup/Mockup_All_Profile_Page.png`, `Mockup/Klient_Radar.png`, mobile w `Mockup/Mockup_All_PWA_MOBILE.png` |
| Dashboard klienta | `/dashboard` dla konta `client` | `Mockup/Klient_Dashbord.png`, `Mockup/Mockup_Dashboard_Premium.png`, mobile w `Mockup/Mockup_All_PWA_MOBILE.png` |
| Homepage | `/` | brak zatwierdzonego mockupu ekranu |
| Dashboard reklamodawcy | `/dashboard` dla `escort`/`business` | brak zatwierdzonego mockupu ekranu |
| Admin | `/admin/*` | brak zatwierdzonego mockupu ekranu |

Pełne przypisanie zawiera [inwentaryzacja](docs/ui/mockup-inventory.md).

## Kolory

Mockupy pokazują czarny/grafitowy system premium z ciepłym złotem, kremowym tekstem i oszczędnymi akcentami statusów. Poniższe istniejące tokeny aplikacji są bazą implementacyjną:

| Rola | HEX/token |
|---|---|
| Głębokie tło | `#070707` / `--er-bg` |
| Tło podniesione | `#0c0b0a` / `--er-bg-elevated` |
| Powierzchnia | `#11100e` / `--er-surface` |
| Powierzchnia wtórna | `#17130f` / `--er-surface-2` |
| Złoto | `#f4d77f` / `--er-gold` |
| Złoto mocne | `#d9a84e` / `--er-gold-strong` |
| Jasne złoto/krem | `#fff0ba` / `--er-gold-soft` |
| Tekst główny | `#f8f0dc` / `--er-text` |
| Tekst wyciszony | `#a99f8e` / `--er-muted` |
| Fioletowy akcent | `#7b4dff` / `--er-purple` |
| Online/sukces | `#36d486` / `--er-green` |
| Ostrzeżenie | `#f6b84b` / istniejący token stanu |
| Błąd | `#ef5c6d` / `--er-red` |
| Offline | `#9a9aa4` / token statusu radaru |

Nie rozszerzać turkusu ani fioletu na duże powierzchnie, jeśli mockup ekranu tego nie pokazuje. Kolory brandingowych grafik są referencją assetu, a nie automatycznie tokenem UI.

## Typografia

- Tekst interfejsu: istniejący stos `Inter, ui-sans-serif, system-ui, sans-serif`.
- Nagłówki premium/marketingowe mogą używać istniejącego `"Playfair Display", Georgia, serif`, gdy pokazuje to mockup.
- Dashboard, Radar, formularze i nawigacja używają zwartej typografii bezszeryfowej.
- Wielkości i line-height należy odtwarzać z proporcji mockupu; wartości niewidoczne jednoznacznie są do zatwierdzenia przez właściciela.
- Hierarchia: jeden dominujący `h1`, nagłówki sekcji, etykiety, tekst pomocniczy. Nie powiększać nagłówków kosztem podstawowych kontrolek.

## Szerokość, grid i proporcje

- Istniejący limit treści `1480px` może pozostać bazą tam, gdzie nie przeczy mockupowi.
- Nie zmieniać globalnej szerokości aplikacji dla korekty pojedynczego ekranu.
- Radar desktop: pionowy panel po lewej i dominująca scena po prawej; proporcję należy dopasować wizualnie do mockupu, nie ustalać arbitralnie.
- Dashboard desktop: stały sidebar i elastyczna część robocza.
- Profil desktop: galeria/treść oraz wyraźny obszar działań, bez utraty obecnych funkcji.
- Mobile: jedna kolumna, brak poziomego overflow, priorytet treści pierwszego ekranu.

Dokładne maksymalne szerokości specyficzne dla ekranów, których nie da się wywnioskować z materiału, są do zatwierdzenia przez właściciela.

## Spacing, radiusy, obramowania i cienie

- Bazowy spacing wynika z widocznej skali 4/8 px; większe odstępy budować jako wielokrotności.
- Istniejące radiusy: `8px`, `14px`, `22px` (`--er-radius-sm/md/lg`).
- Obramowania: cienkie, niskokontrastowe, złote lub neutralne; bazowo `rgba(246, 211, 129, .16)`.
- Karty: ciemna powierzchnia, subtelny inset i cień; bazowo `--er-shadow-card`.
- Glow stosować oszczędnie na aktywnym CTA, fokusie, radarowym centrum i aktywnym statusie.
- Nie tworzyć neonowej poświaty na każdej karcie i kontrolce.

## Komponenty

### Przyciski

- Główne CTA: pełne ciepłe złoto, ciemny tekst, wyraźny stan hover/focus/disabled.
- Drugorzędne: ciemna powierzchnia z cienką ramką.
- Destrukcyjne: czerwony akcent, bez konkurowania z głównym CTA.
- Minimalny touch target: `44 × 44px`.
- Nacisk może dawać subtelne `scale(.97)`; ruch musi respektować `prefers-reduced-motion`.

### Formularze

- Etykieta nad kontrolką, stan focus, walidacja success/warning/error i czytelny disabled.
- Kontrolki nie mogą ucinać wartości ani powodować poziomego overflow.
- Reset jest drugorzędny; zapis/wyszukiwanie jest głównym CTA.

### Karty i badge

- Karta ma czytelną hierarchię: obraz/ikona, tytuł, metadane, status, działanie.
- Badge statusu używa koloru semantycznie i nie może być jedynym nośnikiem informacji.
- Hover karty: lekki lift, cień i kontrolowany glow.

### Header i nawigacja desktopowa

- Czarny/grafitowy, zwarty, z subtelnym złotym obramowaniem.
- Logo, główne akcje i konto nie mogą wypierać treści.
- Zmiana headera dla jednej trasy wymaga klasy trasy, nie globalnego override.

### Bottom navbar mobile

- Stały czarno-grafitowy pasek z cienką złotą ramką.
- Aktywna pozycja: złoty tekst/ikona lub subtelne złote tło.
- Maksymalnie oszczędne akcenty funkcjonalne; nie używać intensywnego turkusu jako całego aktywnego pola bez zatwierdzenia mockupu.
- Musi uwzględniać `safe-area-inset-bottom` i nie może zasłaniać treści ani CTA.

## Breakpointy i viewporty

- Implementacja może zachować istniejące breakpointy `1180/900/720px`, jeśli wynik odpowiada mockupowi.
- Główna granica mobile w aktualnym UI: `720px`.
- Obowiązkowa kontrola: desktop `1440 × 900` oraz mobile `390 × 844`, zoom 100%.
- Dodatkowo sprawdzić wąski ekran `360px`, jeśli zmiana dotyczy formularzy lub nawigacji.

## Stany

- Loading: skeleton/shimmer o strukturze docelowej, bez skakania layoutu.
- Empty: zwarta informacja, krótka przyczyna i jedno użyteczne działanie.
- Error: jednoznaczny komunikat i retry, bez ujawniania danych technicznych.
- Disabled: wizualnie słabszy, ale nadal czytelny.
- Premium lock: jasno opisuje blokadę i korzyść, zachowuje widok kontekstu i prowadzi do istniejącej aktywacji.
- Stany pokazane w `Mockup/Mockup_All_States_Feedback.png` i `Mockup/Mockup_All_Forms_Setings.png` są referencją wspólną.

## Desktop i mobile

- Mobile nie jest pomniejszonym desktopem: zmienia kolejność i gęstość, ale zachowuje funkcje.
- Najważniejsze CTA i kontekst ekranu muszą znaleźć się w pierwszym logicznym obszarze.
- Elementy desktopowe można zwinąć, przenieść do panelu lub modalu, lecz nie usuwać funkcji.
- Każdy overlay, sticky CTA i bottom navbar musi mieć zarezerwowane miejsce w treści.

## Obowiązkowa kontrola wizualna

1. Wykonać screenshot desktop i mobile przy zoomie 100%.
2. Dla stanów zależnych od danych użyć Playwright interception lub fixture wyłącznie testowego.
3. Wykonać porównanie z mockupem po wyrównaniu skali/obszaru roboczego.
4. Samodzielnie otworzyć i obejrzeć screenshoty oraz porównania.
5. Sprawdzić loading, empty, error i premium lock, jeśli występują na ekranie.
6. Uruchomić typecheck, build, właściwe testy i `git diff --check`.
7. Nie deklarować 1:1 na podstawie samych testów.
8. Uzyskać akceptację właściciela przed commit, push lub deploymentem.
