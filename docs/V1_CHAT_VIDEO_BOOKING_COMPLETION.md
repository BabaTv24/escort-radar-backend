# V1 — Czat, Wideoczat, Booking: stan i plan ukończenia

> **Stan historyczny. Obowiązuje `ESCORT_RADAR_BUSINESS_CONTRACT_V1.md` (migracja 060).** Zapytanie o rezerwację jest bezpłatne (0 BC), `create_paid_booking_request` odmawia z `PAID_BOOKING_DISABLED`, a produkt `profile_booking` jest nieaktywny. Opisy opłaty 5 BC poniżej dotyczą kodu sprzed kontraktu. Wideoczat nadal nie jest zaimplementowany i nie pobiera BC.

Misja: ER-V1-CORE-FEATURES-001 · Data analizy: 2026-11-11 · Tryb: analiza bez zmian w kodzie aplikacji.

## 0. Stan bazowy (dowody)

| Element | Ustalenie | Dowód |
|---|---|---|
| Backend produkcyjny (Render) | commit `632ef1c` = lokalny `HEAD` | `GET https://escort-radar-backend.onrender.com/api/version` → `"commit":"632ef1c2…"` |
| Lokalne zmiany niewdrożone | 21 plików zmodyfikowanych (auth, profiles, uploads, admin, locales…) — **nie dotyczą czatu/bookingu** | `git diff --stat` |
| Frontend produkcyjny (Hostinger) | bundle `assets/index-DCcEEQ-t.js`, zbudowany z `VITE_BCU_WALLET_ENABLED != 'true'` | w bundlu brak stringów `Czat · 3 BC` i `5 BC. Kontynuować?` (gałęzie wycięte przez Vite), jest `Moduł rezerwacji jest przygotowany…` (placeholder) |
| Flaga `BCU_WALLET_ENABLED` na backendzie prod | **nieustalona** — nie wykonano żadnego żądania zapisującego | `/api/sponsored/me` i `/api/booking-requests/me` zwracają 401 przed sprawdzeniem flagi |
| Migracja 052 na bazie prod | **nieustalona** — wymaga zapytania read-only (sekcja D, krok 0) | — |
| Testy | `sponsoredProfiles`, `advertiserDashboardArchitecture`, `communicationPlus`: 31/31 pass | `npx tsx --test …` — to głównie testy statyczne (regex po źródłach), nie integracyjne |

Architektura: Front `Front/src` (Vite+React, `DashboardPage.tsx` 3681 linii, `ProfilePage.tsx`), Back `Back/src` (Express, routery montowane w `Back/src/server.ts:70-89`), Supabase (migracje `supabase/migrations/001…055`). Role: `client | escort | business` (`Back/src/middleware/auth.ts:11`), dostęp ogłoszeniodawcy wymaga aktywnej subskrypcji (`requireAdvertiserAccess`, `auth.ts:126`).

---

## A. CURRENT IMPLEMENTATION

### A1. Czat tekstowy + AI

**Co działa (w kodzie):** czat klient ↔ profil **wyłącznie dla profili sponsorowanych** (`sponsorship_type = 'admin_sponsored'`) i **wyłącznie przy `BCU_WALLET_ENABLED=true`**. Klient płaci 3 BC raz za relację, wiadomości są trwałe, AI odpowiada tylko przed aktywacją profilu przez właściciela; po claimie rozmowy przechodzą do właściciela.

| Warstwa | Plik / obiekt |
|---|---|
| Tabele | `profile_chat_sessions` (status `open/owner_takeover/closed`, `handled_by agent/owner`, `owner_read_at`, unique `(profile_id, client_user_id)`), `profile_chat_messages` (`sender_type client/agent/owner`, `agent_disclosure_shown`), `profile_ai_agents` (`mode`, `disclosure`, `active`), `bcu_profile_interactions` — `supabase/migrations/052_sponsored_profiles_ai_bcu.sql:56-155` |
| RPC | `start_paid_profile_chat` (`052:550`) — **rzuca `PROFILE_NOT_SPONSORED` dla zwykłych profili**; `charge_bcu_profile_interaction` (`052:~325`) |
| Legacy, nieużywane | `private_chat_sessions` (`009_closed_token_economy.sql:57`) — brak kodu, nie rozwijać |
| API | `POST /api/sponsored/profiles/:profileId/chat`, `GET /api/sponsored/chat/:sessionId`, `POST /api/sponsored/chat/:sessionId/messages`, `GET /api/sponsored/me` — `Back/src/routes/sponsoredProfiles.ts`; cały router za `verifyUser` + flagą BCU (`:11-15`) |
| Uprawnienia | backend: `ownedChatSession()` (`sponsoredProfiles.ts:174`) — tylko klient sesji lub właściciel profilu; RLS bez polityk + `revoke` dla `anon/authenticated` (`052` koniec) → dostęp tylko przez service role. **Poprawne.** |
| AI | `Back/src/services/sponsoredProfileAgent.ts` — OpenAI Responses API (fallback deterministyczny), whitelist pól profilu (`allowedProfileFields`), zakaz potwierdzania terminów/dostępności, filtr podszywania się, stała disclosure `PROFILE_AGENT_DISCLOSURE` (wariant „konto nieaktywowane”) |
| Przejęcie | tylko automatyczne przy claimie (`052:534` ustawia `owner_takeover`); wiadomość właściciela dozwolona po aktywacji (`sponsoredProfiles.ts:52`) |
| UI klienta | `Front/src/pages/ProfilePage.tsx:397-412` (sekcja czatu), `:535-565` (`openSponsoredChat`, `sendChatMessage`); przycisk `:480` — **w prod bundlu gałąź czatu jest wycięta**, przycisk pokazuje WhatsApp/komunikat aktywacji |
| UI ogłoszeniodawcy | `DashboardPage.tsx:2696-2712` (panel „Czekają na Ciebie”: liczniki + ostatnia wiadomość, bez odpowiedzi); sekcja `messages` w nowym dashboardzie = **placeholder** (`AdvertiserDashboardShell.tsx:257`, tekst `advertiserDashboard.placeholder.messages`) |
| Admin | `GET /api/admin/chat-sessions` (`admin.ts:3389`), `GET /api/admin/sponsored-profiles` |
| Realtime | **brak** (brak Supabase channel/WebSocket/polling w czacie; `VITE_WS_URL` w `.env.production` nieużywany) |

Odpowiedzi na pytania 1–10: (1) 3 endpointy czatu działają dla sponsorowanych; (2) `profile_chat_sessions/messages`; (3) sekcja czatu w `ProfilePage` (nieaktywna w prod); (4) brak interfejsu odpowiedzi dla ogłoszeniodawcy; (5) brak realtime; (6) trwałość — tak (Postgres); (7) uprawnienia — tak, backend; (8) przełącznik ON/OFF — **brak**; (9) AI ma kontekst tylko z whitelisty pól profilu, nie z treści „zatwierdzonych przez ogłoszeniodawcę”; (10) ręczne przejęcie/oddanie — **brak** (tylko claim; po aktywacji AI nie odpowiada wcale).

### A2. Wideoczat

| Element | Status |
|---|---|
| UI połączenia, sygnalizacja, WebRTC, STUN/TURN, powiadomienie o połączeniu, accept/reject, kamera/mikrofon, zakończenie sesji, kontrolki prywatności | **NOT IMPLEMENTED** (zero wystąpień `RTCPeerConnection/getUserMedia/turn:` w V1 i V2) |
| `POST /api/sponsored/profiles/:profileId/videochat` (`sponsoredProfiles.ts:85`) | **PARTIALLY / WADLIWE** — pobiera 7 BC (`profile_videochat`, 70 000 BCU) i zwraca `owner_notification_pending`; **żadne powiadomienie ani sesja nie powstaje** |
| Przycisk `Live · 7 BC` (`ProfilePage.tsx:485`, `:567`) | **UI PLACEHOLDER** (w prod: komunikat `profile.liveCamAvailable`) |
| `LiveCreatorControls`, „Go live”, `creator.enablePrivateChat` (`DashboardPage.tsx:2043, 2132, 2216, 2264`) | **UI PLACEHOLDER** bez handlerów (w martwym/legacy kodzie) |
| Communication Plus (100 BC, `055`) | sprzedaje pakiet z „Live Chat / Live Video / Booking — w przygotowaniu”; **żaden endpoint nie konsumuje uprawnienia `communication_plus`** |
| V2 | `VIDEO_CHAT_IMPLEMENTED = false` (`escort-radar2.0/apps/api/src/v2/router.ts:55`), przełącznik wideo zablokowany w UI |

### A3. Booking

| Warstwa | Plik / obiekt |
|---|---|
| Tabela | `booking_requests` (`004_subscription_and_bookings.sql:9`): `profile_id, requester_email, requested_date date, requested_time time, duration_minutes, message, status`; `052:157` dodaje `requester_user_id, chat_session_id, client_request_key, owner_claimed_at`, status `awaiting_owner_activation` |
| RLS | `004:28` **„Anyone can create booking requests” `with check (true)`** — nigdzie nieusunięta; select/update dla właściciela (`011:132-160`) |
| RPC | `create_paid_booking_request` (`052:583`) — idempotentne, pobiera 5 BC, status zależny od aktywacji |
| API | `Back/src/routes/bookingRequests.ts`: `POST /api/booking-requests` (bez BCU: **anonimowy insert, brak walidacji profilu/daty**), `GET /me` i `GET /profiles/:id` (ogłoszeniodawca, wymaga aktywnej subskrypcji), `PATCH /:id/status` (dowolne przejście między statusami, nie ustawia `updated_at`); admin: `GET/PATCH /api/admin/bookings…` (`admin.ts:2957+`) |
| UI klienta | formularz `ProfilePage.tsx:376-394` (tylko dla aktywowanego klienta — `canUsePremiumProfileFeatures = activated`, `:111`); `submitBooking` `:142` **bez try/catch** — błąd API nie jest pokazywany; brak listy „moje rezerwacje”, brak anulowania |
| UI ogłoszeniodawcy | `loadBookingRequests` (`DashboardPage.tsx:506`) ładuje dane, ale renderowany jest tylko licznik; sekcja `bookings` = **placeholder**; lista z `DashboardPage.tsx:1318` leży w zakomentowanym legacy bloku; `api.setBookingStatus` (`api.ts:383`) **nie jest wywoływane nigdzie** |
| Dostępność | `profiles.opening_hours` jsonb z `timezone` + `weekly` (`023`, normalizacja `Back/src/validation.ts:~170`, edytor `AvailabilityHoursEditor.tsx`); `availability_status`/`operator_status` (radar). **Booking nie korzysta z żadnego z nich.** |
| Strefa czasowa | `booking_requests` bez strefy; interpretacja niejawna |
| Podwójne rezerwacje | brak kontroli |
| Powiadomienia | brak (jedyny e-mail w systemie to potwierdzenie rejestracji Supabase Auth) |
| Salony / business | konto `business` + plan `business_monthly` istnieją (`auth.ts:204`); `GET /api/profiles/me` zwraca **jeden** profil (`profiles.ts:188 .limit(1)`); `GET /booking-requests/me` zwraca bookingi **wszystkich** profili z danym `user_id`; brak modelu pracowników/przypisań |
| Płatność | 5 BC za zapytanie (BCU), brak zaliczek/zwrotów — poza zakresem |

---

## B. MISSING COMPONENTS (tylko zweryfikowane)

### P0 — blokuje komercyjne uruchomienie

| ID | Brak / defekt | Dowód |
|---|---|---|
| P0-1 | Ogłoszeniodawca nie może przeglądać i akceptować/odrzucać rezerwacji (placeholder) | `AdvertiserDashboardShell.tsx:257`, brak wywołań `setBookingStatus` |
| P0-2 | Klient nie widzi statusu swoich rezerwacji i nie może anulować; bez BCU `requester_user_id` nie jest zapisywany | `bookingRequests.ts:36-43`, brak `GET /mine` |
| P0-3 | Bezpieczeństwo/monetyzacja bookingu: polityka RLS `with check (true)` pozwala wstawiać rekordy kluczem anon z pominięciem backendu i opłaty BC; ścieżka bez BCU nie sprawdza profilu (publiczny/aktywny/nie własny) ani daty z przeszłości | `004:28`, `bookingRequests.ts:36` |
| P0-4 | `PATCH /:id/status` pozwala na dowolne przejścia (np. `rejected → accepted`, cofnięcie do `pending`) i nie aktualizuje `updated_at` | `bookingRequests.ts:91-121` |
| P0-5 | Formularz bookingu połyka błędy (402 brak BC, 400) — klient nie wie, że nic nie wysłano | `ProfilePage.tsx:142-160` |
| P0-6 | Czat działa tylko dla profili sponsorowanych; zwykły ogłoszeniodawca nie może otrzymywać wiadomości | `052:564` `PROFILE_NOT_SPONSORED` |
| P0-7 | Brak interfejsu odpowiadania na wiadomości po stronie ogłoszeniodawcy i listy rozmów po stronie klienta | placeholder `messages`; `GET /sponsored/me` filtruje tylko sponsorowane |
| P0-8 | Brak przełączników TEXT CHAT / AI ASSISTANT / VIDEO CHAT oraz ręcznego takeover/release | brak tabeli/kolumn i endpointów |
| P0-9 | AI po aktywacji nie odpowiada (tryb `owner_assistant` nieobsłużony); disclosure zawsze „konto nie zostało aktywowane” — błędna dla aktywnego profilu | `sponsoredProfiles.ts:66-68`, `sponsoredProfileAgent.ts:4` |
| P0-10 | Wideoczat pobiera 7 BC bez dostarczenia usługi (gdy BCU włączone) | `sponsoredProfiles.ts:85-97` |
| P0-11 | Decyzja właściciela: czat i booking w obecnym kodzie są płatne w BC i zależą od `BCU_WALLET_ENABLED`; front prod zbudowany z flagą wyłączoną. Trzeba wybrać model uruchomienia (patrz D, krok 0) | bundle prod, `config.ts:144` |

### P1 — ważne, może po starcie

- P1-1 Powiadomienia e-mail (nowa rezerwacja → ogłoszeniodawca; zmiana statusu → klient; nowa wiadomość). Na start wystarczą liczniki in-app z pollingu.
- P1-2 Realtime czatu (Supabase Realtime broadcast lub SSE) — na start polling 10–15 s (wzorzec V2 `Sections.tsx:243`).
- P1-3 Strefa czasowa w `booking_requests` (kopiowana z `opening_hours.timezone` profilu) i wyświetlanie „czas lokalny profilu”.
- P1-4 Kontrola kolizji przy akceptacji (zakładka `accepted` nakładająca się w czasie) + walidacja wobec `opening_hours`.
- P1-5 Salon: przełącznik profilu w dashboardzie (obecnie `limit(1)`), filtr bookingów/rozmów per profil.
- P1-6 Rate limiting `POST /booking-requests` i `POST …/messages` (brak `express-rate-limit`).
- P1-7 Licznik nieprzeczytanych po stronie klienta (`client_read_at`).
- P1-8 Wideoczat 1:1 (sekcja C, V-plan).
- P1-9 Decyzja, co faktycznie odblokowuje Communication Plus (dziś nic) — wymaga decyzji biznesowej, nie zmiany cen.

### P2 — opcjonalne

- Kontekst AI z FAQ zatwierdzonego przez ogłoszeniodawcę (nowe pole), szkice odpowiedzi AI (V2 `/advertiser/assistant/reply-drafts`), przypisanie bookingu do pracownika salonu, usunięcie martwego legacy bloku w `DashboardPage.tsx` i tabeli `private_chat_sessions`.

---

## C. IMPLEMENTATION PLAN (P0)

Zasada: **jeden system wiadomości = tabele V1 `profile_chat_*`**. Tabele V2 `v2_conversations/v2_messages` (`escort-radar2.0/supabase/migrations/056`) **nie są przenoszone** — przenosimy logikę V2 na tabele V1.

### Migracja `supabase/migrations/056_profile_communication_and_booking_hardening.sql` (jedna, addytywna)

```sql
-- 1. Ustawienia komunikacji (port V2 057, nazwa V1). Brak wiersza = domyślne.
create table if not exists public.profile_communication_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  text_chat_enabled boolean not null default false,   -- opt-in ogłoszeniodawcy
  ai_assistant_enabled boolean not null default false,
  video_chat_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.profile_communication_settings enable row level security;
revoke all on public.profile_communication_settings from public, anon, authenticated;
grant all on public.profile_communication_settings to service_role;
-- Profile sponsorowane zachowują obecne zachowanie:
insert into public.profile_communication_settings (profile_id, text_chat_enabled, ai_assistant_enabled)
select id, true, true from public.profiles where sponsorship_type = 'admin_sponsored'
on conflict do nothing;

-- 2. Odczyt klienta
alter table public.profile_chat_sessions add column if not exists client_read_at timestamptz;

-- 3. Booking: usunięcie anonimowego insertu, updated_at
drop policy if exists "Anyone can create booking requests" on public.booking_requests;
create trigger set_booking_requests_updated_at before update on public.booking_requests
for each row execute procedure public.set_updated_at();   -- poprzedzić "drop trigger if exists"

-- 4. start_paid_profile_chat: create or replace — zamiast PROFILE_NOT_SPONSORED:
--    sponsorowany  → jak dotąd;
--    pozostałe     → wymagane text_chat_enabled = true w profile_communication_settings,
--                    inaczej raise 'TEXT_CHAT_DISABLED'. Opłata 3 BC bez zmian (charge_bcu_profile_interaction).
```

Przed zastosowaniem: zweryfikować read-only na prod, że 052 jest zastosowana (`select column_name from information_schema.columns where table_name='booking_requests' and column_name='requester_user_id'`) oraz `select policyname from pg_policies where tablename='booking_requests'`. Migracja tylko na polecenie właściciela.

### P0-1 Ogłoszeniodawca: sekcja Rezerwacje
- **Plik nowy:** `Front/src/components/advertiser-dashboard/AdvertiserBookingsSection.tsx` (wzorzec: `AdvertiserWalletSection.tsx` — przyjmuje `token`).
- **Zmiana:** `DashboardPage.tsx` `AdvertiserDashboardWorkspace` (`:2311-2347`) — dodać gałąź `activeSection === 'bookings'` i usunąć `bookings` z listy placeholdera (`:2345`).
- **Reuse:** `api.myBookingRequests`, `api.setBookingStatus` (`api.ts:382-383`), wzorzec UI V2 `BusinessCenter.tsx:129 BusinessRequests` (logika, nie CSS); klucze `status.*` już w locales.
- **Zawartość:** lista z nazwą profilu (`profiles.display_name` już w selekcie `/me`), datą/godziną, czasem trwania, wiadomością; przyciski „Akceptuj/Odrzuć” dla `pending`, „Anuluj” dla `accepted`; zakładki Oczekujące/Historia.
- **UI:** przed implementacją przeczytać `UI_IMPLEMENTATION_CONTRACT.md`, `docs/ui/…`, mockup z `Mockup/` (wymóg AGENTS.md) + screenshot desktop/mobile.
- **Test:** `tests/advertiserBookingsSection.test.ts` — sekcja renderuje dane z API, brak danych demo, przyciski tylko dla dozwolonych przejść; aktualizacja `advertiserDashboardArchitecture.test.ts`.
- **Ryzyko:** niskie (nowy komponent, istniejące API).

### P0-2 Klient: moje rezerwacje + anulowanie
- **Plik:** `Back/src/routes/bookingRequests.ts` — dodać `GET /mine` (`verifyUser`, `requester_user_id = req.user.id`, join `profiles(id, display_name, city, work_city)`) i `POST /:id/cancel` (tylko właściciel zapytania, tylko `pending`/`awaiting_owner_activation`). **Reuse 1:1:** V2 `apps/api/src/v2/router.ts:213-231`.
- **POST bez BCU:** wymagać `verifyUser` + konto `client` zawsze (nie tylko w BCU) i zapisywać `requester_user_id`, `requester_email = req.user.email` (front nie musi pytać o e-mail).
- **Front:** `api.ts` → `myClientBookings`, `cancelBooking`; `DashboardPage.tsx` `ClientDashboard` (`:1483`) — panel „Moje rezerwacje” (wzorzec V2 `office/Sections.tsx:126 RequestsSection`, funkcja `bookingView`).
- **Test:** rozszerzyć istniejący styl testów statycznych + test jednostkowy guardu anulowania.
- **Zależność:** kolumna `requester_user_id` (052). **Ryzyko:** średnie — zmiana wymagań auth dla POST (zgodna z UI: formularz i tak jest tylko dla aktywowanego klienta).

### P0-3 Utwardzenie POST /booking-requests
- **Plik:** `bookingRequests.ts:10-47`. Dodać walidację (obie ścieżki): profil `status='active'`, `is_published`, `moderation_status='approved'`, `user_id` niepusty i ≠ requester (reuse `isPublicProfile` z `Back/src/publicProfiles.ts:8` — ta sama funkcja co w `profiles.ts` `/:id/access`); `requested_date` ≥ dziś (w strefie `opening_hours.timezone`, fallback `Europe/Berlin` jak `validation.ts`), format `HH:MM`, `duration_minutes ∈ {60,120,240}` (wartości z formularza).
- **Migracja:** drop polityki anon (wyżej).
- **Test:** `tests/bookingRequestsValidation.test.ts` — odrzuca przeszłą datę, profil niepubliczny, własny profil.

### P0-4 Maszyna stanów statusu
- **Plik:** `bookingRequests.ts:91`. Dozwolone dla właściciela: `pending → accepted|rejected`, `accepted → cancelled`; `awaiting_owner_activation` tylko przez claim. Update warunkowy `.eq('status', expected)` (ochrona przed wyścigiem), `updated_at` z triggera.
- **Test:** tabela przejść (dozwolone/odrzucone → 409).

### P0-5 Obsługa błędów formularza
- **Plik:** `ProfilePage.tsx:142-160` — `try/catch`, mapowanie 402 → „brak BC” + link do `/coins`, 401 → login, inne → komunikat; stan `submitting` blokujący podwójny klik; po sukcesie link „Zobacz status” do panelu klienta. Usunąć pole e-mail, jeśli P0-2 bierze e-mail z sesji.
- Teksty `window.confirm` z cenami „5 BC/3 BC/7 BC” są zaszyte — przenieść do locales i brać cenę z `GET /api/bcu/…products` (bez zmiany cen).

### P0-6/7/8/9 Czat dla wszystkich profili + przełączniki + takeover + AI
Backend — **ten sam router** `Back/src/routes/sponsoredProfiles.ts` (bez nowego systemu; opcjonalnie później zmiana nazwy pliku):
1. `POST /profiles/:profileId/chat` — bez zmian w kodzie; zmiana w RPC (migracja pkt 4).
2. `GET /conversations` — rozmowy, w których użytkownik jest klientem **lub** właścicielem profilu (bez filtra `sponsorship_type`), z ostatnią wiadomością i licznikiem nieprzeczytanych (wzorzec V2 `router.ts:263-291`). Zastępuje filtr w `GET /me` dla zwykłych profili; `GET /me` zostaje dla panelu sponsorowanego.
3. `POST /chat/:sessionId/takeover` i `/release` — właściciel; ustawia `handled_by = 'owner'|'agent'`, `status = 'owner_takeover'|'open'` (kolumny już istnieją). Wzorzec V2 `router.ts:368-387`.
4. `POST /chat/:sessionId/messages` — (a) klient: odrzuć 403 `TEXT_CHAT_DISABLED`, gdy wyłączony (historia nadal czytelna); (b) wiadomość właściciela = implicit takeover (`handled_by='owner'`); (c) AI odpowiada gdy: profil sponsorowany nieaktywowany (obecna ścieżka) **lub** `ai_assistant_enabled && handled_by='agent'`; (d) `POST /chat/:id/read` → `owner_read_at`/`client_read_at`.
5. `GET/PUT /communication-settings` (właściciel; profil z `user_id = req.user.id`, przy wielu profilach parametr `profile_id` sprawdzany pod kątem własności) — wzorzec V2 `router.ts:389-410`; `video_chat_enabled` odrzucany dopóki `VIDEO_CHAT_IMPLEMENTED=false`.
6. Publiczne `GET /api/profiles/:id/communication` w `Back/src/routes/profiles.ts` (poza routerem z `verifyUser`), zwraca tylko booleany.

AI — `Back/src/services/sponsoredProfileAgent.ts`:
- `answerAsSponsoredProfileAgent(profile, messages, mode)`; dla `mode='owner_assistant'` disclosure per locale: DE „KI-Assistent von {display_name} — Sie sprechen mit einem KI-Assistenten.”, PL „Asystent AI {display_name} — rozmawiasz z asystentem AI.”, EN analogicznie. Zachować wszystkie obecne zakazy (bez potwierdzania terminów/dostępności). Reuse tekstów i odpowiedzi tematycznych z V2 `apps/api/src/v2/assistant.ts:185-239` (`profileAssistantReply`) jako fallback deterministyczny.
- Zaktualizować świadomie test `sponsoredProfiles.test.ts:117` („owner assistant never auto-replies”) → „owner assistant odpowiada tylko gdy włączony i bez takeover”.

Frontend:
- `Front/src/components/advertiser-dashboard/AdvertiserMessagesSection.tsx` (lista rozmów + wątek + przycisk Przejmij/Oddaj AI + 3 przełączniki) — port logiki V2 `office/Sections.tsx:203-300` (`ConversationList`, `ChatThread`, polling 15 s) i `advertiser/Communication.tsx`, w stylach V1. Podpięcie w `AdvertiserDashboardWorkspace` (`activeSection === 'messages'`).
- `ProfilePage.tsx:480` — przycisk czatu zależny od `communication.text_chat` (z nowego endpointu), nie od `sponsorship_type`; etykiety nadawcy: AI = „Asystent AI {name}”, nie „Asystent Profilu Escort Radar” dla aktywnych profili; polling wątku.
- `ClientDashboard` — „Moje rozmowy” (ta sama lista, rola klienta).
- `api.ts`/`types.ts` — nowe metody/typy.
- **Testy:** `tests/profileChatPermissions.test.ts` (klient obcy → 404, właściciel innego profilu → 404, wyłączony czat → 403 dla nowej rozmowy, takeover wycisza AI, release przywraca), test disclosure (zawsze prefiks AI), test braku potwierdzeń terminów w fallbacku. Adaptacja V2 `tests/v2/favorites-communication.integration.test.mts`.
- **Ryzyko:** średnie (RPC + zmiana zachowania AI). Zależność: P0-11.

### P0-10 Wideoczat — wyłączenie sprzedaży
- `sponsoredProfiles.ts:85` — dodać stałą `VIDEO_CHAT_IMPLEMENTED = false` (jak V2) i zwracać `409 VIDEO_CHAT_NOT_AVAILABLE` **przed** `charge_bcu_profile_interaction`.
- `ProfilePage.tsx:485,567` — ukryć „· 7 BC”, przycisk pokazuje „wkrótce” lub jest ukryty (`communication.video_chat === false`).
- Bez migracji. Produkt `profile_videochat` w `system_bcu_products` zostaje (nie zmieniamy cennika).
- Test: endpoint nie wywołuje RPC opłaty.

### P0-11 Decyzja modelu uruchomienia (właściciel)
Obecny kod: czat 3 BC, booking 5 BC, wideo 7 BC, wszystko za `BCU_WALLET_ENABLED`. Front prod zbudowany z flagą wyłączoną. Opcje (bez zmiany cen):
- **A (zalecana):** włączyć `BCU_WALLET_ENABLED` (Render) i `VITE_BCU_WALLET_ENABLED=true` (build Hostinger) po weryfikacji 043–055 na prod — wykorzystuje gotowe, atomowe i przetestowane RPC.
- **B:** czat/booking bez opłat BC przy fladze wyłączonej — wymaga zdjęcia warunku flagi z routera czatu i ścieżki insert; prostsze, ale zmienia model monetyzacji.

---

## C2. Wideoczat — najmniejsza ścieżka (P1, nie blokuje startu)

1. Transport: WebRTC 1:1 w przeglądarce (bez SDK), sygnalizacja przez **Supabase Realtime broadcast** (kanał prywatny `call:{id}` z autoryzacją — infrastruktura już opłacona) lub istniejący backend Express (Render obsługuje WebSocket, `VITE_WS_URL` już zdefiniowany).
2. TURN: wymagany dla realnych sieci mobilnych; **usługa płatna** (np. Cloudflare TURN / Twilio NTS / Metered) — **wymaga zgody właściciela**. Bez TURN tylko STUN (część połączeń nie zestawi się).
3. Tabela `video_call_sessions` (`id, profile_id, client_user_id, status ringing|accepted|rejected|ended|expired|missed, started_at, ended_at, end_reason`), RLS jak `profile_chat_*`.
4. Endpointy w `sponsoredProfiles.ts`: `POST /profiles/:id/video-calls` (tylko gdy `video_chat_enabled`), `POST /video-calls/:id/accept|reject|end`, `GET /video-calls/incoming` (polling 5 s, potem Realtime).
5. Opłata: dziś „attempt” (pobierana od razu). Zalecenie: pobierać dopiero przy `accepted` — to zmiana kontraktu płatności → decyzja właściciela.
6. Prywatność: zgoda obu stron (accept), brak nagrywania, przycisk zakończ/zgłoś (reuse `reportsRouter`), timeout dzwonienia 45 s.
Szacunek: 4–6 dni roboczych po decyzji o TURN. Niezależne od czatu i bookingu.

---

## D. SHORTEST SAFE IMPLEMENTATION PATH

0. **Weryfikacja read-only prod (0,5 dnia):** zapytania SQL o migracje 043–055 i polityki `booking_requests`; odczyt env Render (`BCU_WALLET_ENABLED`, `OPENAI_API_KEY`). Decyzja P0-11.
1. **Bezpieczeństwo bez UI (0,5 dnia):** P0-10 (blokada wideo), P0-3 (walidacja POST), P0-4 (statusy), P0-5 (błędy formularza). Testy.
2. **Migracja 056 (przegląd + zastosowanie na polecenie):** ustawienia komunikacji, `client_read_at`, drop polityki anon, trigger `updated_at`, nowa wersja `start_paid_profile_chat`.
3. **Booking end-to-end (1,5 dnia):** P0-2 backend + panel klienta, P0-1 sekcja ogłoszeniodawcy (z mockupem i screenshotami).
4. **Czat end-to-end (2–3 dni):** endpointy lista/takeover/release/settings/read, AI `owner_assistant` + disclosure, `AdvertiserMessagesSection`, czat na profilu dla wszystkich profili z `text_chat_enabled`, „Moje rozmowy” klienta, polling.
5. **Weryfikacja:** testy jednostkowe/statyczne nowych reguł + jeden scenariusz Playwright na stagingu (klient → booking → ogłoszeniodawca akceptuje → klient widzi status; klient → wiadomość → AI → takeover → odpowiedź właściciela). Akceptacja wizualna właściciela przed commitem/deployem.
6. P1 w kolejności: e-mail powiadomienia → strefa czasowa → kolizje → przełącznik profili salonu → realtime → wideo.

Łącznie P0: ok. 5–6 dni roboczych.

---

## E. FINAL VERDICT

1. **Czy V1 można ukończyć bez migracji do V2?** Tak. Tabele, RPC z opłatami BC, uprawnienia czatu i booking istnieją w V1; brakuje warstw UI i kilku endpointów. V2 służy jako źródło logiki do przeniesienia, nie jako platforma.
2. **Które komponenty czatu działają?** Tabele `profile_chat_sessions/messages`, start czatu z opłatą 3 BC, pobieranie/wysyłanie wiadomości z kontrolą dostępu w backendzie, AI z disclosure dla nieaktywowanych profili sponsorowanych, przekazanie historii przy claimie. Wszystko tylko dla profili sponsorowanych i tylko przy `BCU_WALLET_ENABLED=true`; w obecnym froncie prod ścieżka jest wyłączona.
3. **Co uniemożliwia użyteczny czat?** Ograniczenie do profili sponsorowanych (`PROFILE_NOT_SPONSORED`), brak UI odpowiedzi dla ogłoszeniodawcy (placeholder), brak listy rozmów klienta, brak przełączników ON/OFF i takeover/release, AI nieaktywne po aktywacji profilu, front prod zbudowany z wyłączoną flagą BCU.
4. **Co uniemożliwia wideoczat?** Nie istnieje: brak sygnalizacji, WebRTC, TURN, sesji i accept/reject. Jest tylko endpoint pobierający 7 BC bez usługi (do zablokowania w P0).
5. **Co uniemożliwia pełny booking dla osób prywatnych?** Ogłoszeniodawca nie ma UI do akceptacji/odrzucenia (API istnieje, nieużywane); klient nie ma widoku statusu ani anulowania i bez BCU nie jest powiązany z rezerwacją; dowolne przejścia statusów; brak walidacji i otwarta polityka RLS insert; błędy formularza są połykane.
6. **Co dodatkowo blokuje salony?** To samo co w pkt 5. Ponadto dashboard obsługuje jeden profil na konto (`limit(1)`). Lista bookingów `/me` obejmuje już wszystkie profile właściciela, więc salon z jednym profilem firmowym działa po P0-1. Wiele profili i przypisanie pracowników to P1/P2.
7. **Które ulepszenia V2 można użyć od razu?** Logika endpointów `bookings/mine` i `bookings/:id/cancel` (`v2/router.ts:213-231`), takeover/release i implicit takeover (`:323-387`), ustawienia komunikacji (`:389-410` + schemat 057 jako wzór), `profileAssistantReply` z disclosure DE/PL/EN (`v2/assistant.ts:185`), UI `Communication.tsx`, `ChatThread`/`ConversationList`/`RequestsSection` (`office/Sections.tsx`), `BusinessRequests` (`BusinessCenter.tsx:129`) oraz stała `VIDEO_CHAT_IMPLEMENTED`. Tabel `v2_conversations/v2_messages` nie przenosimy.
8. **Prawdziwe blokery startu:** P0-1 … P0-11 (sekcja B).
9. **Co można odłożyć bez wprowadzania klientów w błąd:** wideoczat (przycisk ukryty lub oznaczony „wkrótce”, bez opłaty), e-maile (status widoczny w panelu), realtime (polling), strefy czasowe (etykieta „czas lokalny profilu”), kolizje (to zapytania, nie potwierdzone sloty), multi-profil salonu. Warunek: Communication Plus nadal pokazuje „w przygotowaniu” przy Live Video.
10. **Następny konkretny krok:** wykonać read-only weryfikację prod (krok 0: migracje 043–055, `pg_policies` dla `booking_requests`, flagi Render) i podjąć decyzję P0-11, a potem zaimplementować krok 1 (blokada opłaty za wideo, walidacja i maszyna stanów bookingu, obsługa błędów formularza). Ten krok nie wymaga migracji ani zmian UI.

---

## Raport wykonania

- **Problem:** brak precyzyjnego obrazu brakujących elementów czatu, wideo i bookingu w V1.
- **Przyczyna:** funkcje zbudowane częściowo (backend/RPC dla profili sponsorowanych), UI dashboardu w placeholderach, wyłączona flaga BCU we froncie prod.
- **Pliki zmienione:** wyłącznie `docs/V1_CHAT_VIDEO_BOOKING_COMPLETION.md` (nowy). Kod, baza i produkcja bez zmian.
- **Komendy:** grep/odczyt źródeł V1 i V2; `curl` GET: `escort-radar.fun`, bundle JS, `/api/health`, `/api/version`, dwa GET zwracające 401; `npx tsx --test tests/sponsoredProfiles.test.ts tests/advertiserDashboardArchitecture.test.ts tests/communicationPlus.test.ts` → 31/31 pass.
- **Wdrożenie:** brak. **Commit/push:** brak.
- **Wycofanie:** usunąć ten plik.
- **Nieustalone:** wartość `BCU_WALLET_ENABLED` na Renderze i stan migracji na bazie prod (krok 0).
