# Lista zainteresowanych (pre-launch) — prywatność i projekt Datenschutzerklärung

ER-V1-PUBLIC-PREVIEW-003. Status: **zbieranie wyłączone** (`WAITLIST_COLLECTION_ENABLED` brak/false).
Uruchomienie produkcyjne wymaga autoryzacji BOSS po wyjaśnieniu zgodności z planowaną działalnością i wnioskiem
Einstiegsgeld / §16c SGB II (Jobcenter) oraz po weryfikacji prawnej poniższego tekstu.

## 1. Jakie dane i po co

| Pole | Cel |
|---|---|
| `email` | wysłanie linku potwierdzającego i jednorazowej informacji o starcie wybranej oferty |
| `interest_type` | segment: `client_premium` (0,99 EUR jednorazowo) lub `advertiser` (49,99 EUR / 30 dni) |
| `preferred_language` | język wiadomości (z interfejsu, de/pl/en) |
| `status`, `created_at`, `confirmed_at`, `unsubscribed_at` | double opt-in, wycofanie zgody, statystyka |
| `consent_version`, `consent_given_at` | dowód, na jaki tekst zgody wyrażono zgodę i kiedy |
| `source_page` | strona, z której przyszło zgłoszenie (fanpage, register, pricing…) — bez URL i parametrów |
| `confirm_token_hash`, `confirm_token_expires_at` | SHA-256 jednorazowego tokenu (48 h); sam token jest tylko w e-mailu |

Nie są zapisywane: hasło, konto, telefon, adres, płatności, IP, User-Agent, historia przeglądania, preferencje.
Adres IP jest używany wyłącznie w pamięci do limitów (5 zgłoszeń / godz. / adres), jako hash, bez zapisu.

## 2. Ochrona

- Tabele `waitlist_leads`, `waitlist_announcements`, `waitlist_deliveries`: RLS włączone, brak polityk, `revoke all` dla `anon` i `authenticated`
  → brak odczytu i zapisu kluczem publicznym; dostęp wyłącznie backend (`service_role`).
- Panel admina: tylko agregaty (bez adresów). Eksport CSV (tylko potwierdzone, niewypisane) wymaga JWT admina i jest zapisywany w `admin_audit_log`.
- Neutralne odpowiedzi (nowy / oczekujący / potwierdzony adres → ta sama odpowiedź), honeypot, limity per adres i globalny, max 5 wysyłek na rekord,
  10 min odstępu między wysyłkami.
- Brak usługi e-mail (host, nadawca, sekret ≥ 32 znaki) → lista zamknięta (503), nic nie jest zapisywane. Nieudana wysyłka → nowy rekord usuwany.

## 3. Retencja (automatycznie, co 6 h — `prune_waitlist`)

- Niepotwierdzone: usuwane po **30 dniach** (token wygasa po 48 h).
- Wypisane: adres usuwany (anonimizacja) po **30 dniach** od wycofania zgody; zostaje tylko liczba do statystyki.
- Potwierdzone: usuwane najpóźniej **730 dni** po potwierdzeniu (jeżeli start nie nastąpi wcześniej); po wysłaniu informacji o starcie
  BOSS może zlecić wcześniejsze usunięcie segmentu.
- Żądanie usunięcia (Art. 17): `delete from public.waitlist_leads where email = lower('<adres>');` (SQL Editor, na polecenie BOSS).

## 4. Komunikacja

Wyłącznie: (1) e-mail potwierdzający, (2) krótka informacja „adres już potwierdzony” przy ponownym zgłoszeniu, (3) jednorazowa informacja
o starcie segmentu (`WAITLIST_LAUNCH_SEND_ENABLED`, osobna flaga, wyłączona; jedna wysyłka na segment, link wypisania + nagłówek `List-Unsubscribe`).
Żadnych innych kampanii. Nadawca: firmowa skrzynka `kontakt@support.escort-radar.fun` (Hostinger) przez Hostinger Mail API (HTTPS) — nie prywatny Gmail, nie systemy
BABA-AI niezwiązane z projektem. API nie obsługuje nagłówka `List-Unsubscribe`; link wypisania jest w treści każdej wiadomości.

## 5. Do decyzji / weryfikacji prawnej

- Dane administratora (BABA-AI Agency po rejestracji działalności w Berlinie) — **nie wpisano, brak danych**.
- Dostawca e-mail: Hostinger (skrzynka `kontakt@support.escort-radar.fun`) — dokładna firma, siedziba, AVV i region przetwarzania **do uzupełnienia z umowy Hostinger**.
- Dowód zgody: zapisywane są czas zgłoszenia, wersja tekstu zgody i czas potwierdzenia; **IP nie jest zapisywane** (minimalizacja).
  Prawnik powinien potwierdzić, że to wystarcza jako dowód double opt-in (część orzecznictwa oczekuje także IP).
- Kompatybilność z Einstiegsgeld / §16c SGB II i terminem rozpoczęcia działalności (Jobcenter) — przed publikacją formularza.

## 6. Entwurf: Abschnitt für die Datenschutzerklärung (zur rechtlichen Prüfung)

> **Entwurf – nicht ohne rechtliche Prüfung veröffentlichen. Angaben in eckigen Klammern ergänzen; nichts davon ist hier erfunden.**

**Interessentenliste vor dem Marktstart (Double-Opt-in)**

*Verantwortlicher:* [Name/Firma, Anschrift, E-Mail – BABA-AI Agency, nach Gewerbeanmeldung in Berlin; Verweis auf das Impressum].

*Zweck:* Wenn Sie über die Schaltfläche „Ich interessiere mich für Premium“ oder „Ich möchte ein Inserat schalten“ Ihr Interesse vormerken,
verarbeiten wir Ihre E-Mail-Adresse, das gewählte Angebot (Premium für Kunden oder Premium-Inserat), die Sprache der Website, die Seite, auf der
Sie sich eingetragen haben, sowie Zeitpunkte der Anmeldung, Bestätigung und eines etwaigen Widerrufs. Wir nutzen diese Daten ausschließlich, um
Ihnen eine Bestätigungs-E-Mail und einmalig eine Nachricht zum Start des gewählten Angebots zu senden. Andere Werbung senden wir nicht.
Die Eintragung erstellt kein Kundenkonto, ist keine Bestellung, reserviert keine kostenpflichtige Leistung und begründet keine Zahlungspflicht.

*Rechtsgrundlage:* Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO; für die Benachrichtigung per E-Mail zusätzlich § 7 Abs. 2 Nr. 2 UWG).
Die Einwilligung wird erst wirksam, wenn Sie den Link in unserer Bestätigungs-E-Mail anklicken (Double-Opt-in). Zum Nachweis speichern wir
den Zeitpunkt der Eintragung, die Version des Einwilligungstextes und den Zeitpunkt der Bestätigung. [Ggf. weitere Nachweisdaten nach
rechtlicher Prüfung.]

*Widerruf:* Sie können Ihre Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen – über den Link „Einwilligung widerrufen“ in jeder
unserer E-Mails oder per E-Mail an [Kontaktadresse]. Die Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung bleibt unberührt (Art. 7 Abs. 3 DSGVO).

*Speicherdauer:* Nicht bestätigte Eintragungen löschen wir nach 30 Tagen. Nach einem Widerruf löschen wir Ihre E-Mail-Adresse spätestens nach
30 Tagen. Bestätigte Eintragungen löschen wir, sobald der Zweck erfüllt ist, spätestens jedoch 24 Monate nach der Bestätigung.

*E-Mail-Versand und Empfänger:* Für den Versand nutzen wir [Name des E-Mail-Dienstleisters, Sitz] als Auftragsverarbeiter (Art. 28 DSGVO).
Die Daten werden in [Supabase Inc. – Datenbank, Region: …] gespeichert und von [Render Services, Inc. – Server, Region: …] verarbeitet.

*Übermittlung in Drittländer:* [Falls ein Dienstleister Daten außerhalb der EU/des EWR verarbeitet: Angabe des Landes und der Garantie –
Angemessenheitsbeschluss (z. B. EU-U.S. Data Privacy Framework) oder Standardvertragsklauseln nach Art. 46 Abs. 2 lit. c DSGVO.]

*Ihre Rechte:* Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung (Art. 18), Datenübertragbarkeit (Art. 20),
Widerruf der Einwilligung (Art. 7 Abs. 3) sowie Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO), z. B. bei der Berliner Beauftragten für
Datenschutz und Informationsfreiheit. Eine automatisierte Entscheidungsfindung oder Profilbildung findet nicht statt.
