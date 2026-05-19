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
  available_now: boolean;
  mobile_service: boolean;
  private_studio: boolean;
  verified: boolean;
  status: 'pending' | 'active' | 'rejected' | 'suspended';
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
