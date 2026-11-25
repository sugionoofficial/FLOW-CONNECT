export type GenerationMode =
  | 'text_to_video'
  | 'frames_to_video'
  | 'ingredients_to_video'
  | 'text_to_image'

export type GenerationStatus = 'queued' | 'processing' | 'done' | 'failed'

export type AspectRatio = '16:9' | '9:16' | '1:1'

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  credits: number
  plan: string
  created_at: string
}

export interface Project {
  id: string
  user_id: string
  title: string
  description: string | null
  cover_url: string | null
  created_at: string
  updated_at: string
}

export interface InputAsset {
  role: 'first_frame' | 'last_frame' | 'ingredient'
  url: string
  path?: string
}

export interface Generation {
  id: string
  project_id: string
  user_id: string
  mode: GenerationMode
  model: string
  prompt: string
  aspect_ratio: AspectRatio
  status: GenerationStatus
  output_url: string | null
  thumbnail_url: string | null
  input_assets: InputAsset[]
  settings: Record<string, unknown>
  cost: number
  error: string | null
  is_favorite: boolean
  created_at: string
  completed_at: string | null
}

export interface Scene {
  id: string
  project_id: string
  generation_id: string
  position: number
  trim_start: number
  trim_end: number | null
  created_at: string
}
