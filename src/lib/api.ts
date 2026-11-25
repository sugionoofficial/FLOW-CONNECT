import { supabase } from './supabase'
import type { AspectRatio, Generation, GenerationMode, InputAsset, Profile, Project, Scene } from './types'

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message)
}

/* ───────── profile ───────── */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  fail(error)
  return data as Profile | null
}

/* ───────── projects ───────── */
export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select('*').order('updated_at', { ascending: false })
  fail(error)
  return (data ?? []) as Project[]
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle()
  fail(error)
  return data as Project | null
}

export async function createProject(title?: string): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .insert({ title: title?.trim() || 'Project tanpa judul' })
    .select()
    .single()
  fail(error)
  return data as Project
}

export async function updateProject(id: string, patch: Partial<Pick<Project, 'title' | 'description' | 'cover_url'>>) {
  const { error } = await supabase.from('projects').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  fail(error)
}

export async function deleteProject(id: string) {
  const { error } = await supabase.from('projects').delete().eq('id', id)
  fail(error)
}

/* ───────── generations ───────── */
export async function listGenerations(projectId: string): Promise<Generation[]> {
  const { data, error } = await supabase
    .from('generations')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  fail(error)
  return (data ?? []) as Generation[]
}

export interface CreateGenerationInput {
  projectId: string
  mode: GenerationMode
  model: string
  prompt: string
  aspectRatio: AspectRatio
  count: number
  costEach: number
  inputAssets: InputAsset[]
  settings?: Record<string, unknown>
}

const RPC_ERRORS: Record<string, string> = {
  insufficient_credits: 'Kredit tidak cukup untuk generate ini.',
  project_not_found: 'Project tidak ditemukan.',
  not_authenticated: 'Silakan masuk terlebih dahulu.',
  invalid_count: 'Jumlah output harus 1–4.',
}

export async function createGenerations(input: CreateGenerationInput): Promise<Generation[]> {
  const { data, error } = await supabase.rpc('create_generations', {
    p_project_id: input.projectId,
    p_mode: input.mode,
    p_model: input.model,
    p_prompt: input.prompt,
    p_aspect_ratio: input.aspectRatio,
    p_count: input.count,
    p_cost_each: input.costEach,
    p_input_assets: input.inputAssets,
    p_settings: input.settings ?? {},
  })
  if (error) {
    const key = Object.keys(RPC_ERRORS).find((k) => error.message.includes(k))
    throw new Error(key ? RPC_ERRORS[key] : error.message)
  }
  return (data ?? []) as Generation[]
}

export async function updateGeneration(id: string, patch: Partial<Generation>) {
  const { data, error } = await supabase.from('generations').update(patch).eq('id', id).select().single()
  fail(error)
  return data as Generation
}

export async function deleteGeneration(id: string) {
  const { error } = await supabase.from('generations').delete().eq('id', id)
  fail(error)
}

export async function refundGeneration(id: string) {
  const { error } = await supabase.rpc('refund_generation', { p_generation_id: id })
  fail(error)
}

/* ───────── scenes ───────── */
export async function listScenes(projectId: string): Promise<Scene[]> {
  const { data, error } = await supabase.from('scenes').select('*').eq('project_id', projectId).order('position')
  fail(error)
  return (data ?? []) as Scene[]
}

export async function addScene(projectId: string, generationId: string, position: number): Promise<Scene> {
  const { data, error } = await supabase
    .from('scenes')
    .insert({ project_id: projectId, generation_id: generationId, position })
    .select()
    .single()
  fail(error)
  return data as Scene
}

export async function removeScene(id: string) {
  const { error } = await supabase.from('scenes').delete().eq('id', id)
  fail(error)
}

export async function reorderScenes(scenes: Scene[]) {
  await Promise.all(
    scenes.map((s, i) => supabase.from('scenes').update({ position: i }).eq('id', s.id).then(({ error }) => fail(error))),
  )
}

/* ───────── storage ───────── */
export async function uploadAsset(userId: string, file: File): Promise<{ url: string; path: string }> {
  const ext = file.name.split('.').pop() || 'png'
  const path = `${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('assets').upload(path, file, { contentType: file.type, upsert: false })
  fail(error)
  const { data } = supabase.storage.from('assets').getPublicUrl(path)
  return { url: data.publicUrl, path }
}
