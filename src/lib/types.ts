export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface GoogleAccount {
  id: string
  user_id: string
  email: string
  label: string | null
  display_name: string | null
  avatar_url: string | null
  verified: boolean
  is_default: boolean
  last_used_at: string | null
  created_at: string
  updated_at: string
}
