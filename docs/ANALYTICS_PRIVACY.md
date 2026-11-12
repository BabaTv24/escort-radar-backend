# Analityka ruchu — dokumentacja prywatności (ER-V1-PUBLIC-PREVIEW-002)

Status: **zbieranie wyłączone** (`ANALYTICS_COLLECTION_ENABLED` brak/false) do czasu przeglądu prawnego.
Dashboard „Traffic Intelligence” działa i pokazuje „Erfassung deaktiviert”.

## 1. Charakter danych — pseudonimizacja, nie anonimizacja

- `visitor_hash` = SHA-256(sól dzienna + adres IP + User-Agent), skrócony do 128 bitów. Dopóki sól istnieje (dzień bieżący
  i następny), backend mógłby obliczyć ten sam hash z adresu i UA. To są **dane pseudonimowe** (art. 4 pkt 5 RODO), nie anonimowe.
- Sól jest losowa, przechowywana tylko w `traffic_salts` i usuwana po dniu następnym. Po tym czasie hashe nie dają się
  odtworzyć ani połączyć między dniami — liczba odwiedzających jest szacunkiem dziennym.
- Nie są zapisywane: adres IP, User-Agent, cookies, identyfikatory urządzenia, konto, e-mail, parametry zapytań.
- Adres IP i UA są przetwarzane wyłącznie w pamięci serwera przy obliczaniu hasha i limitów.

## 2. Profile (wrażliwy charakter serwisu)

Wizyta na konkretnym profilu ogłoszeniodawcy może pozwalać na wnioski o życiu seksualnym (art. 9 RODO). Dlatego:
- `profile_view` jest zapisywany **bez** `visitor_hash` (wymuszone ograniczeniem w bazie) i z czasem zaokrąglonym do pełnej godziny;
- nie da się połączyć wyświetlenia profilu z innymi zdarzeniami tej samej osoby; dashboard pokazuje wyłącznie liczbę wyświetleń na profil.
Rekomendacja: przed włączeniem zbierania BOSS i doradca prawny decydują, czy statystyka per profil jest w ogóle potrzebna
(alternatywa: wyłączenie `profile_view`).

## 3. Ochrona przed zawyżaniem

- Adres klienta: pozycja w `X-Forwarded-For` zapisana przez zaufany proxy (`ANALYTICS_TRUSTED_PROXY_HOPS`, domyślnie 1 = ostatni wpis);
  wpisy dopisane przez klienta są ignorowane. Nagłówki brzegowe (`cf-connecting-ip`) tylko po jawnej konfiguracji `ANALYTICS_CLIENT_IP_HEADER`.
  **Do weryfikacji na Render przed włączeniem** (test akceptacyjny A6).
- Limity w pamięci: 120 zdarzeń/10 min na odwiedzającego, 300/10 min na adres, maks. 5 różnych pseudonimów na adres dziennie.
- Tylko origin `https://escort-radar.fun`; boty/automatyzacja wykluczone; DNT i GPC respektowane (klient i serwer).

## 4. Retencja

- Surowe zdarzenia: 60 dni (okno 30 dni + porównanie z poprzednimi 30). Sole: dzień bieżący + poprzedni.
- `prune_traffic_analytics` uruchamiany przy starcie backendu i co 6 godzin — niezależnie od tego, czy zbieranie jest włączone.

## 5. Zgoda

Mechanizm nie zapisuje niczego na urządzeniu i nie odczytuje z niego danych poza tym, co przeglądarka i tak przesyła przy żądaniu
(IP, User-Agent). Czy to wystarcza do wyłączenia obowiązku zgody z § 25 TDDDG oraz czy podstawą może być art. 6 ust. 1 lit. f RODO,
**musi ocenić prawnik** — nie przyjmujemy, że zgoda jest kategorycznie zbędna. Jeżeli prawnik uzna zgodę za konieczną,
flaga pozostaje wyłączona albo zbieranie zostaje powiązane z banerem zgody.

## 6. Entwurf: Abschnitt für die Datenschutzerklärung (zur rechtlichen Prüfung)

> **Entwurf – nicht ohne rechtliche Prüfung veröffentlichen. Platzhalter in eckigen Klammern ergänzen.**

**Reichweitenmessung ohne Cookies**

Wir messen die Nutzung von escort-radar.fun mit einem eigenen, auf unseren Servern betriebenen Verfahren. Es werden keine Cookies
gesetzt, keine Informationen auf Ihrem Endgerät gespeichert und keine Dienste Dritter (z. B. Google Analytics) eingesetzt.

Bei einem Seitenaufruf übermittelt Ihr Browser technisch bedingt Ihre IP-Adresse und die Browserkennung (User-Agent) an unseren Server.
Aus diesen Angaben und einem zufälligen Schlüssel, der täglich neu erzeugt und spätestens nach dem folgenden Tag gelöscht wird, bilden wir
eine verkürzte Prüfsumme (Hash). IP-Adresse und Browserkennung werden dabei nicht gespeichert. Die Prüfsumme ist ein Pseudonym: Sie dient
nur dazu, Besuche desselben Tages zu zählen; nach Löschung des Tagesschlüssels kann sie nicht mehr neu berechnet oder mit anderen Tagen
verknüpft werden.

Gespeichert werden: Art des Ereignisses (Seitenaufruf, Aufruf des Radars, Stadtsuche, Aufruf eines Profils, Aufruf der Premium- bzw.
Inserenten-Bestell- oder Registrierungsseite), die aufgerufene Seitenart ohne Suchparameter, gegebenenfalls Stadt, die verweisende Website
(nur Domain), der Gerätetyp (Mobil/Tablet/Desktop), soweit von unserem Hosting-Dienstleister übermittelt das Land, die Prüfsumme sowie
Datum und Uhrzeit. Aufrufe einzelner Profile werden ohne Prüfsumme und nur mit stundengenauer Zeitangabe gespeichert, sodass sie keiner
Person und keinem anderen Besuch zugeordnet werden können.

Zweck ist die statistische Auswertung der Reichweite und des Interesses an unserem Angebot. Rechtsgrundlage: [Art. 6 Abs. 1 lit. f DSGVO –
berechtigtes Interesse an der Reichweitenmessung / alternativ Art. 6 Abs. 1 lit. a DSGVO i. V. m. § 25 Abs. 1 TDDDG – Einwilligung;
durch Rechtsberatung festzulegen].

Wenn Ihr Browser „Do Not Track“ oder „Global Privacy Control“ sendet, findet keine Erfassung statt. Automatisierte Zugriffe (Bots) werden
nicht erfasst.

Speicherdauer: Die Ereignisdaten werden nach 60 Tagen automatisch gelöscht, der Tagesschlüssel spätestens nach dem folgenden Tag.

Empfänger: [Render Services, Inc. – Hosting des Servers, Region: …] und [Supabase Inc. – Datenbank, Region: …] als Auftragsverarbeiter.
[Angaben zu Drittlandübermittlungen und Garantien ergänzen.]

Ihre Rechte: Sie haben nach Art. 21 DSGVO das Recht, der Verarbeitung zu widersprechen; technisch können Sie dies jederzeit über
„Do Not Track“/„Global Privacy Control“ Ihres Browsers tun. Im Übrigen gelten Ihre Rechte auf Auskunft, Berichtigung, Löschung,
Einschränkung und Beschwerde bei einer Aufsichtsbehörde [Verweis auf den allgemeinen Abschnitt]. Da wir keine Identifikatoren speichern,
können wir einzelne Datensätze in der Regel keiner Person zuordnen (Art. 11 DSGVO).
