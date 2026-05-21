export type ProfileImage = {
  id: string;
  storage_path: string;
  public_url?: string;
  is_primary: boolean;
  is_blurred: boolean;
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
  account_type?: 'private' | 'agency' | 'massage_salon' | 'club_party' | 'live_cam';
  primary_phone?: string | null;
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
  body_type?: string;
  body_features?: string[];
  hair_color?: string;
  origin?: string;
  experience_type?: string;
  slug: string;
  city: string;
  area?: string | null;
  category?: string | null;
  description?: string | null;
  languages: string[];
  orientation?: string;
  audience?: string[];
  visit_types?: string[];
  service_tags?: string[];
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
  service_radius_km?: number;
  approximate_location_area?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  distance_km?: number | null;
  available_now: boolean;
  mobile_service: boolean;
  private_studio: boolean;
  verified: boolean;
  status: 'pending' | 'active' | 'rejected' | 'suspended';
  verification_status?: 'pending' | 'verified' | 'rejected' | 'changes_requested';
  moderation_status?: 'clean' | 'review' | 'suspended' | 'blocked';
  is_test_account?: boolean;
  admin_note?: string | null;
  verified_at?: string | null;
  suspended_at?: string | null;
  blocked_at?: string | null;
  subscription_status: string;
  listing_plan?: string;
  listing_price?: number;
  listing_currency?: string;
  subscription_started_at?: string | null;
  subscription_expires_at?: string | null;
  max_photos?: number;
  trial_ends_at?: string | null;
  profile_images?: ProfileImage[];
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
  action: string;
  target_type: string;
  target_id?: string | null;
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

export type TokenPackage = {
  id?: string;
  name: string;
  token_amount: number;
  eur_price: number;
  bonus_tokens: number;
  featured: boolean;
  active?: boolean;
};
