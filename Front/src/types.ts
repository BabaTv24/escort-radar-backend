export type ProfileImage = {
  id: string;
  profile_id?: string;
  storage_path: string;
  public_url?: string;
  url?: string;
  image_url?: string;
  is_primary: boolean;
  is_cover?: boolean;
  is_blurred: boolean;
  is_hidden?: boolean;
  is_private?: boolean;
  moderation_status?: 'pending' | 'approved' | 'rejected' | 'blocked';
  admin_note?: string | null;
  sort_order?: number;
  created_at?: string;
};

export type ServiceMenuItem = {
  name: string;
  enabled: boolean;
  included: boolean;
  extra_price?: number | null;
  note?: string | null;
};

export type ServicePricingItem = {
  mode: 'included' | 'extra';
  extra_price?: number | null;
};

export type Profile = {
  id: string;
  user_id?: string;
  display_name: string;
  account_type?: 'private' | 'agency' | 'massage_salon' | 'club_party' | 'live_cam' | 'escort' | 'business';
  profile_type?: 'private_escort' | 'agency' | 'club' | 'massage_salon' | 'live_cam' | 'couple' | 'trans' | 'gay' | 'male_escort' | 'other';
  primary_phone?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  telegram?: string | null;
  additional_phones?: string[];
  phone_owner_identity_label?: string | null;
  phone_rule_confirmed?: boolean;
  phone_conflict_status?: 'clear' | 'warning' | 'conflict';
  public_user_id?: string | null;
  referral_code?: string | null;
  referred_by_code?: string | null;
  referral_count?: number;
  gender?: string | null;
  orientation?: string | null;
  travels?: boolean | null;
  penis_length_cm?: number | null;
  penis_diameter_cm?: number | null;
  age?: number;
  height?: number;
  height_cm?: number | null;
  weight_kg?: number | null;
  bust?: string | null;
  eyes?: string | null;
  hair?: string | null;
  travel?: string | null;
  ethnicity?: string | null;
  nationality?: string | null;
  zodiac_sign?: string | null;
  business_name?: string | null;
  business_type?: string | null;
  business_id?: string | null;
  business_phone?: string | null;
  exact_address?: string | null;
  max_profiles?: number | null;
  contact_person?: string | null;
  website?: string | null;
  opening_hours?: Record<string, unknown> | string | null;
  body_type?: string;
  body_features?: string[];
  hair_color?: string;
  origin?: string;
  experience_type?: string;
  slug: string;
  city: string;
  area?: string | null;
  work_country?: string | null;
  work_city?: string | null;
  work_area?: string | null;
  postal_code?: string | null;
  work_place_label?: string | null;
  category?: string | null;
  description?: string | null;
  languages: string[];
  audience?: string[];
  visit_types?: string[];
  service_tags?: string[];
  services?: string[];
  tag_ids?: string[];
  tags?: Tag[];
  payment_methods?: string[];
  availability_note?: string;
  price_30min?: number | null;
  price_1h?: number | null;
  price_2h?: number | null;
  price_3h?: number | null;
  price_night?: number | null;
  outcall_fee?: number | null;
  currency?: string;
  service_menu?: ServiceMenuItem[];
  service_pricing?: Record<string, ServicePricingItem>;
  availability_status?: 'available' | 'busy' | 'unavailable';
  operator_status?: 'ONLINE_NOW' | 'BUSY' | 'TRAVELING' | 'AVAILABLE_TODAY' | 'APPOINTMENT_ONLY' | 'OFFLINE';
  working_today_start?: string | null;
  working_today_end?: string | null;
  working_tomorrow_start?: string | null;
  working_tomorrow_end?: string | null;
  working_24_7?: boolean;
  travel_city?: string | null;
  travel_arrival_date?: string | null;
  travel_departure_date?: string | null;
  hotspot_type?: 'hotel' | 'apartment' | 'club' | 'private' | 'mobile' | 'vacation' | null;
  radar_score?: number;
  premium_tier?: 'standard' | 'gold' | 'elite' | 'diamond';
  is_seed_profile?: boolean;
  is_sponsored?: boolean;
  sponsorship_type?: 'none' | 'admin_sponsored';
  owner_activation_status?: 'not_required' | 'awaiting_owner_activation' | 'active';
  owner_activated_at?: string | null;
  ai_agent_mode?: 'disabled' | 'pre_activation' | 'owner_assistant';
  acquisition_source?: string | null;
  source_url?: string | null;
  source_url_normalized?: string | null;
  import_source?: string | null;
  imported_at?: string | null;
  provider?: string | null;
  revenue_amount?: number | null;
  is_published?: boolean;
  admin_priority?: number;
  match_score?: number;
  service_radius_km?: number;
  approximate_location_area?: string | null;
  location_mode?: 'exact' | 'postal_area' | 'hidden' | 'exact_hidden' | 'approximate' | 'city_only';
  location_visibility?: 'exact' | 'postal_area' | 'city_only' | 'hidden';
  latitude?: number | null;
  longitude?: number | null;
  location_approximate?: boolean;
  location_precision?: 'exact' | 'postal_area' | 'area' | 'city' | null;
  location_updated_at?: string | null;
  auto_location_on_login?: boolean;
  auto_location_while_online?: boolean;
  distance_km?: number | null;
  available_now: boolean;
  mobile_service: boolean;
  private_studio: boolean;
  verified: boolean;
  status: 'pending' | 'active' | 'rejected' | 'suspended';
  verification_status?: 'pending' | 'verified' | 'rejected' | 'changes_requested';
  moderation_status?: 'pending' | 'approved' | 'rejected' | 'suspended';
  is_test_account?: boolean;
  admin_note?: string | null;
  visibility_audit?: {
    isPublicVisible: boolean;
    isVisibleInCurrentSearch: boolean;
    reasons: string[];
    checks: Record<string, boolean>;
    normalized: {
      country: string | null;
      city: string | null;
      category: string | null;
    };
  };
  verified_at?: string | null;
  suspended_at?: string | null;
  suspended_reason?: string | null;
  blocked_at?: string | null;
  moderation_note?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  owner_email?: string | null;
  subscription_status: string;
  subscription_plan?: string | null;
  subscription_start?: string | null;
  subscription_end?: string | null;
  subscription_requested_at?: string | null;
  subscription_managed_by?: string | null;
  subscription_note?: string | null;
  listing_plan?: string;
  listing_price?: number;
  listing_currency?: string;
  subscription_started_at?: string | null;
  subscription_expires_at?: string | null;
  max_photos?: number;
  trial_ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
  profile_images?: ProfileImage[];
  images?: ProfileImage[];
  avatar_url?: string | null;
  main_photo_url?: string | null;
  photo_url?: string | null;
  photos?: string[];
  media?: Array<{ public_url?: string; url?: string }>;
  visibility_reason?: 'visible' | 'missing_payment' | 'pending_verification' | 'suspended' | 'blocked' | 'missing_required_fields' | 'no_images';
  locked_features?: string[];
  wallet_summary?: {
    escort_token_balance: number;
    referral_balance: number;
    public_wallet_id?: string;
  };
};

export type Tag = {
  id: string;
  slug: string;
  label: string;
  group_key: string;
  active: boolean;
  sort_order: number;
};

export type BookingRequest = {
  id: string;
  profile_id: string;
  requester_email: string;
  requested_date: string;
  requested_time: string;
  duration_minutes: number;
  message?: string | null;
  idempotency_key?: string;
  status: 'pending' | 'awaiting_owner_activation' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
};

export type AdminReport = {
  id: string;
  profile_id: string;
  reporter_email?: string | null;
  reason: string;
  message?: string | null;
  status: string;
  admin_status?: 'open' | 'investigating' | 'resolved' | 'escalated';
  admin_note?: string | null;
  escalated_to_authorities?: boolean;
  resolved_at?: string | null;
  created_at: string;
  profiles?: {
    display_name?: string;
    city?: string;
    status?: string;
    moderation_status?: string;
  };
};

export type AdminActivity = {
  id: string;
  admin_email?: string | null;
  admin_id?: string | null;
  action: string;
  target_type?: string;
  target_id?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  note?: string | null;
  details?: Record<string, unknown>;
  created_at: string;
};

export type AdminStats = Record<string, number> & {
  bc_coin_package_revenue_eur?: number;
  bc_coin_package_transactions?: number;
  bc_coin_sold_amount?: number;
  bc_coin_bonus_amount?: number;
};

export type Wallet = {
  id: string;
  user_id: string;
  escort_token_balance: number;
  eur_spent: number;
  referral_balance: number;
  public_wallet_id: string;
  solana_wallet_address?: string | null;
  phantom_connected?: boolean;
  frozen?: boolean;
  created_at: string;
};

export type TokenTransaction = {
  id: string;
  from_wallet_id?: string | null;
  to_wallet_id?: string | null;
  amount: number;
  transaction_type: string;
  status: string;
  created_at: string;
};

export type TokenPurchaseRequest = {
  id: string;
  user_id: string;
  wallet_id?: string | null;
  package_id?: string | null;
  token_amount: number;
  eur_price: number;
  bonus_tokens: number;
  status: 'pending' | 'approved' | 'failed' | 'cancelled';
  admin_note?: string | null;
  created_at: string;
};

export type ClientFavorite = {
  id: string;
  profile_id: string;
  created_at: string;
  profile?: Profile | null;
};

export type MasterAdminWallet = {
  id: string;
  name: string;
  reserve_asset: string;
  reserve_amount: number;
  distributed_amount: number;
  burned_amount: number;
  locked_amount: number;
  revenue_estimate_eur: number;
  solana_wallet_address?: string | null;
  phantom_connected?: boolean;
  active: boolean;
};

export type TokenPackage = {
  id?: string;
  package_key?: string;
  name: string;
  token_amount: number;
  eur_price: number;
  bonus_tokens: number;
  featured: boolean;
  active?: boolean;
  description?: string | null;
  badge?: string | null;
  sort_order?: number;
  promotion_starts_at?: string | null;
  promotion_ends_at?: string | null;
};

export type BcCoinPackage = {
  id: string;
  package_key: string;
  title: string;
  coins: number;
  bonus_coins: number;
  price_eur: number;
  currency: string;
  description?: string | null;
  badge?: string | null;
  is_best_value: boolean;
  is_active: boolean;
  sort_order: number;
  promotion_starts_at?: string | null;
  promotion_ends_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HermesProfilePreview = {
  name?: string;
  display_name?: string;
  city?: string;
  location?: string;
  category?: string;
  age?: number | null;
  gender?: string; orientation?: string; height_cm?: number | null; weight_kg?: number | null;
  bust?: string; eyes?: string; hair?: string; travel?: string; travels?: boolean | null;
  visit_types?: string[]; languages?: string[]; ethnicity?: string; nationality?: string; zodiac_sign?: string;
  description?: string;
  phone?: string;
  email?: string;
  website?: string;
  telegram?: string;
  whatsapp?: string;
  services?: string[];
  raw_services?: string[];
  service_groups?: Record<string, string[]>;
  taboos?: string[];
  tags?: string[];
  unmapped_tags?: string[];
  unknown_fields?: Record<string, string>;
  prices?: Record<string, number>;
  price_30min?: number | null;
  price_1h?: number | null;
  price_2h?: number | null;
  price_3h?: number | null;
  price_night?: number | null;
  currency?: 'EUR' | 'PLN' | 'USD' | 'GBP' | 'CHF';
  availability?: string;
  opening_hours?: Profile['opening_hours'];
  images?: string[];
  owner_email?: string;
  raw_about_text?: string;
  raw_visible_text?: string;
  admin_warnings?: string[];
  suggested_owner_email?: string;
  source_url?: string;
  import_source?: string;
};

export type ClientActivation = {
  state: 'client_free' | 'client_activated';
  referral_code?: string | null;
  referral_link?: string | null;
  qr_image_url?: string | null;
  activated_at?: string | null;
  clicks: number;
  registrations: number;
  activations: number;
  earned_rewards: number;
};

export type ClientProfile = {
  id: string;
  user_id: string;
  display_name?: string | null;
  city?: string | null;
  avatar_url?: string | null;
  client_search_country?: string | null;
  client_search_city?: string | null;
  client_search_postal_code?: string | null;
  client_search_area?: string | null;
  client_search_lat?: number | null;
  client_search_lng?: number | null;
  client_search_label?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ClientPersonalProfile = {
  id?: string;
  user_id?: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  street?: string | null;
  house_number?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
  birth_date?: string | null;
  identity_note?: string | null;
  delivery_note?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  consent_personal_data: boolean;
  consent_home_service_contact: boolean;
  consent_verified_client_badge: boolean;
  profile_complete: boolean;
  verification_status: 'incomplete' | 'pending' | 'verified' | 'rejected';
  verified_at?: string | null;
  verified_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ClientSearchPreferences = Pick<
  ClientProfile,
  | 'client_search_country'
  | 'client_search_city'
  | 'client_search_postal_code'
  | 'client_search_area'
  | 'client_search_lat'
  | 'client_search_lng'
  | 'client_search_label'
>;

export type ClientIntent = {
  id: string;
  user_id: string;
  status: 'LOOKING_NOW' | 'LOOKING_TODAY' | 'TRAVELING' | 'BROWSING' | 'OFFLINE';
  city: string;
  area?: string | null;
  radius_km: number;
  category?: string | null;
  services?: string[];
  budget_min?: number | null;
  budget_max?: number | null;
  time_window?: string | null;
  active: boolean;
  expires_at: string;
  match_score?: number;
  client_verification_status?: 'incomplete' | 'pending' | 'verified' | 'rejected';
  client_verified_badge?: boolean;
  client_display_name?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type RadarNotification = {
  id: string;
  user_id: string;
  recipient_type: 'client' | 'advertiser';
  event_type: string;
  title: string;
  body?: string | null;
  profile_id?: string | null;
  client_intent_id?: string | null;
  match_score?: number;
  read_at?: string | null;
  created_at: string;
};

export type CoinWallet = {
  id: string;
  user_id: string;
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  frozen?: boolean;
  created_at: string;
};

export type CoinTransaction = {
  id: string;
  wallet_id: string;
  user_id: string;
  amount: number;
  direction: 'credit' | 'debit';
  transaction_type: string;
  status: string;
  created_at: string;
};

export type BcuWallet = {
  public_wallet_id: string;
  balance_bcu: string;
  balance_bc: string;
  locked_balance_bcu?: string;
  locked_balance_bc?: string;
  available_balance_bcu?: string;
  available_balance_bc?: string;
  lifetime_credit_bcu: string;
  lifetime_credit_bc: string;
  lifetime_debit_bcu: string;
  lifetime_debit_bc: string;
  frozen: boolean;
  migration_status?: string;
  migrated_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type SponsoredChatMessage = {
  id: string;
  session_id: string;
  sender_type: 'client' | 'agent' | 'owner';
  content: string;
  agent_disclosure_shown?: boolean;
  created_at: string;
};

export type SponsoredChatSession = {
  id: string;
  profile_id: string;
  client_user_id: string;
  client_email?: string | null;
  status: 'open' | 'owner_takeover' | 'closed';
  handled_by: 'agent' | 'owner';
  owner_read_at?: string | null;
  last_message_at: string;
  messages?: SponsoredChatMessage[];
};

export type SponsoredProfileDashboard = {
  profiles: Profile[];
  stats: { messages: number; clients: number; booking_attempts: number; unread_clients: number };
  conversations: SponsoredChatSession[];
  booking_requests: BookingRequest[];
};

export type BcuLedgerEntry = {
  amount_bcu: string;
  amount_bc: string;
  direction: 'credit' | 'debit' | 'transfer';
  transaction_type: string;
  status: string;
  reference_type?: string | null;
  reference_id?: string | null;
  created_at: string;
};

export type BcuEntitlement = {
  entitlement_type: 'client_premium' | 'advertiser' | 'small_business' | 'vip_business' | 'communication_plus';
  status: 'active' | 'expired' | 'revoked' | 'pending';
  starts_at: string;
  ends_at?: string | null;
  product_code?: string | null;
};

export type Gift = {
  id: string;
  sender_user_id: string;
  receiver_profile_id?: string | null;
  receiver_user_id?: string | null;
  gift_type: string;
  coin_cost: number;
  message?: string | null;
  status: string;
  created_at: string;
};

export type ProfileAccess = {
  client_state: 'client_activated';
  phone_number?: string | null;
  additional_phones: string[];
  whatsapp?: string | null;
  telegram?: string | null;
  full_gallery: ProfileImage[];
  vip_gallery_unlocked: boolean;
  gifts_enabled: boolean;
  live_cam_enabled: boolean;
};
