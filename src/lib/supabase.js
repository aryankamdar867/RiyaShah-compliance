import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kwoljzhvqossszketmcm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3b2xqemh2cW9zc3N6a2V0bWNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyNTY3MDQsImV4cCI6MjEwMzgzMjcwNH0.vVvwL2vAnVgA49X23zoEHlOG6r-AccUsElRHVQwej_w';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);