//@ts-check

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabaseUrl = process.env.VITE_SUPABASE_URL || ''
const supabasePublishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''

/** @type {import('@supabase/supabase-js').SupabaseClient<import('../supabase.d.ts').Database>} */
const supabase = createClient(supabaseUrl, supabasePublishableKey)
supabase.from('quiz').upsert
