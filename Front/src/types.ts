export type ProfileImage = {
  id: string;
  storage_path: string;
  public_url?: string;
  is_primary: boolean;
  is_blurred: boolean;
};

export type Profile = {
  id: string;
  user_id?: string;
  display_name: string;
  age?: number;
  height?: number;
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
  available_now: boolean;
  mobile_service: boolean;
  private_studio: boolean;
  verified: boolean;
  status: 'pending' | 'active' | 'rejected' | 'suspended';
  subscription_status: string;
  trial_ends_at?: string | null;
  profile_images?: ProfileImage[];
};
