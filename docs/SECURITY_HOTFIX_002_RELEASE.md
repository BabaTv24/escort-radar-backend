# ER-V1-SECURITY-HOTFIX-002 — pakiet wdrożeniowy

Stan na 2026-11-12. Dokument nie zawiera sekretów ani prywatnych danych.

## 1. Zakres

Gałąź `hotfix/v1-public-privacy-002` = produkcyjny backend `632ef1c` + 2 commity:

| Commit | Zawartość |
|---|---|
| `9293b7a` (= `b3cc018`) | profil `postal_area` z punktem o precyzji adresu publikuje tylko punkt miasta |
| `cc3fb41` | autoryzowane dostarczanie zdjęć, ścisły publiczny payload profilu |

Nie zawiera żadnych innych zmian gałęzi `feature/v1-p0-commercial-core` (rezerwacje, czat, portfel, frontend, migracje 059/060).

Zmienione pliki (backend): `Back/src/mediaDelivery.ts` (nowy), `Back/src/server.ts`, `Back/src/supabase.ts`, `Back/src/publicLocation.ts`,
`Back/src/routes/profiles.ts`, `uploads.ts`, `auth.ts`, `admin.ts`, `funPageAdvertisement.ts`. Testy: `tests/mediaDelivery.test.ts`,
`tests/locationPrivacyModes.test.ts`, dwa testy kontraktu źródła. Frontend: bez zmian.

## 2. Działanie

- Publiczny (anonimowy i FREE) profil: dokładnie jedno zatwierdzone zdjęcie, bez `business_phone`, telefonów, e-maili, adresów,
  danych właściciela, moderacji, poleceń i finansów; współrzędne zgodnie z trybem prywatności.
- `MEDIA_SIGNED_DELIVERY=true`: każdy adres zdjęcia to `PUBLIC_API_URL/api/media/image?p=…&e=…&s=…` (HMAC-SHA256 ścieżki i terminu).
  Link wydaje wyłącznie kod, który już sprawdził uprawnienie (okładka publiczna, galeria Premium, właściciel, admin).
  Endpoint przekierowuje (302) do podpisanego adresu Supabase ważnego 1 h. Okładka: link do ~7 dni, zdjęcia chronione: ~1 h.
- Zapisane stare publiczne adresy (awatar klienta, reklama FanPage) są przepisywane przy odczycie.
- Brak `MEDIA_URL_SECRET` (min. 32 znaki) lub adresu API przy włączonej fladze: backend nie startuje (fail closed).

## 3. Wymagana konfiguracja produkcyjna (Render, usługa backendu)

| Zmienna | Wartość |
|---|---|
| `MEDIA_SIGNED_DELIVERY` | `true` |
| `MEDIA_URL_SECRET` | nowy losowy sekret, min. 32 znaki, np. `openssl rand -base64 48`; tylko w Render, nigdy w repozytorium |
| `PUBLIC_API_URL` | `https://escort-radar-backend.onrender.com` (opcjonalnie; Render ustawia też `RENDER_EXTERNAL_URL`) |

Supabase Storage (po wdrożeniu backendu): bucket `profile-images` → `public = false`.

## 4. Kolejność wdrożenia

0. Kopia: potwierdzić najnowszy backup fizyczny (`supabase backups list`), zapisać `GET /api/version` (obecnie `632ef1c`).
1. Render: ustawić 3 zmienne z pkt 3.
2. Render: wdrożyć commit `cc3fb41` z gałęzi `hotfix/v1-public-privacy-002`
   (zmiana gałęzi usługi albo „Deploy a specific commit”). Bez merge do `main`.
3. Kontrola A (bucket nadal publiczny): `/api/version` = `cc3fb41`; anonimowe `/api/profiles` — maks. 1 zdjęcie, adresy `/api/media/image`,
   brak `business_phone`; strona `escort-radar.fun` wyświetla zdjęcia; admin widzi zdjęcia.
4. Storage: `update storage.buckets set public = false where id = 'profile-images';` (albo przełącznik w panelu Supabase).
5. Kontrola B: stary adres `/storage/v1/object/public/profile-images/…` zwraca 400; strona, galeria Premium, panel admina i reklama FanPage
   nadal wyświetlają zdjęcia.

Kroki 2 i 4 muszą następować bezpośrednio po sobie. Krok 4 bez kroku 2 wyłącza wszystkie zdjęcia na stronie
(obecny backend wydaje wyłącznie publiczne adresy).

## 5. Kopia bezpieczeństwa

Fizyczne kopie dzienne Supabase (ostatnia: 2026-11-12 03:23 UTC, status COMPLETED, PITR wyłączone). Odtworzenie nie było testowane.
Hotfix nie zmienia danych ani plików: żaden rekord `profile_images`, `profiles` ani obiekt Storage nie jest modyfikowany ani usuwany.

## 6. Wycofanie

- Zdjęcia nie działają po kroku 4: najpierw sprawdzić zmienne; w ostateczności `public = true` (przywraca też ekspozycję starych adresów).
- Backend wadliwy: Render → Rollback do wdrożenia `632ef1c`, potem `public = true` (stary backend wymaga publicznego bucketu).
- Tylko flaga: `MEDIA_SIGNED_DELIVERY=false` przywraca stare publiczne adresy (wymaga `public = true`).

Priorytetem jest prywatność: przy błędzie wyświetlania preferować poprawkę w przód zamiast ponownego otwarcia bucketu.

## 7. Kontrole po wdrożeniu

- anonimowo: `/api/profiles`, `/api/profiles?radar=1`, `/api/profiles/:id` — ≤1 zdjęcie, brak pól z listy w `tests`/pkt 2;
- link okładki działa; podmiana `p`, `s` lub `e` → 403; przeterminowany link → 403;
- stare publiczne adresy okładki i galerii → 400;
- `/api/profiles/:id/access` anonimowo/FREE → 401/403; Premium → pełna galeria ładuje się;
- właściciel `/api/profiles/me` → wszystkie własne zdjęcia; upload i usunięcie zdjęcia działają;
- admin: lista moderacji zdjęć, edytor profilu, reklama FanPage — zdjęcia ładują się;
- PostgREST anon (po 058/061): `profiles`, `profile_images` → 401.

## 8. Wpływ na obecny frontend

Bez zmian w kodzie frontendu. Frontend używa `public_url` / `imageUrl` bez ograniczeń domeny; brak CSP `img-src`.
FREE widzi 1 zdjęcie zamiast 4. Każde zdjęcie to jedno dodatkowe przekierowanie 302 przez backend (Render).

## 9. Ryzyka

- CDN Supabase może jeszcze przez czas cache (domyślnie do 1 h) serwować wcześniej pobrane publiczne obiekty.
- Adresy pobrane przed zmianą (np. zapisane przez osoby trzecie) przestają działać dopiero po kroku 4.
- Link okładki można udostępnić do ~7 dni (to i tak zdjęcie publiczne); link galerii do ~1 h.
- Zimny start Render opóźnia pierwsze zdjęcia.
- Historia migracji: produkcja ma w `schema_migrations` tylko 053 i 055 z zakresu ≥053; 054 (w schemacie), 058 i 061 (zastosowane 2026-11-12)
  nie są zapisane. `supabase migration repair --status applied 054 058 061` uzupełnia historię bez wykonywania SQL;
  następne `db push` zastosowałoby wtedy 059 i 060 — tylko razem z wdrożeniem backendu gałęzi feature.
- Poza zakresem (istnieje w produkcji `632ef1c`): FREE otrzymuje kod polecający; stara trasa prezentów z ceną od klienta (na DEV 500).
