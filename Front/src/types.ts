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

export type Profile = {
  id: string;
  user_id?: string;
  display_name: string;
  account_type?: 'private' | 'agency' | 'massage_salon' | 'club_party' | 'live_cam' | 'escort' | 'business';
  profile_type?: 'private_escort' | 'agency' | 'club' | 'massage_salon' | 'live_cam' | 'couple' | 'trans' | 'gay' | 'other';
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
  age?: number;
  height?: number;
  height_cm?: number | null;
  nationality?: string | null;
  business_name?: string | null;
  business_type?: string | null;
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
  orientation?: string;
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
  price_night?: number | null;
  outcall_fee?: number | null;
  currency?: string;
  service_menu?: ServiceMenuItem[];
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
  is_published?: boolean;
  admin_priority?: number;
  match_score?: number;
  service_radius_km?: number;
  approximate_location_area?: string | null;
  location_mode?: 'exact_hidden' | 'approximate' | 'city_only';
  latitude?: number | null;
  longitude?: number | null;
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
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
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
  name: string;
  token_amount: number;
  eur_price: number;
  bonus_tokens: number;
  featured: boolean;
  active?: boolean;
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
  created_at?: string;
  updated_at?: string;
};

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
