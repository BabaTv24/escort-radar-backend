alter table public.profiles
  drop constraint if exists profiles_category_check;

alter table public.profiles
  add constraint profiles_category_check
  check (
    category is null or category in (
      'ladies',
      'men',
      'gay',
      'couples',
      'trans',
      'massage',
      'home_hotel',
      'live_cam',
      'clubs_parties',
      'bdsm',
      'onlyfans',
      'sex_phone',
      'films',
      'offers',
      'other',
      'Panie',
      'Panowie',
      'Gay',
      'Pary',
      'Trans',
      'Masaż',
      'Masaz',
      'Dom / Hotel',
      'Kamera Live',
      'Kluby / Imprezy',
      'Inne',
      'house_hotel'
    )
  );

alter table public.profiles
  drop constraint if exists profiles_operator_status_check;

alter table public.profiles
  add constraint profiles_operator_status_check
  check (
    operator_status is null or operator_status in (
      'ONLINE_NOW',
      'AVAILABLE_TODAY',
      'BUSY',
      'APPOINTMENT_ONLY',
      'TRAVELING',
      'OFFLINE',
      'online_now',
      'available_today',
      'busy',
      'appointment',
      'appointment_only',
      'traveling',
      'offline'
    )
  );
