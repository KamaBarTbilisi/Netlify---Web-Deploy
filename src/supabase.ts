import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://grxajpwbsbcilfwoecrm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyeGFqcHdic2JjaWxmd29lY3JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMzcwNzcsImV4cCI6MjA4OTkxMzA3N30.9L1IE2vhNYXHRZ_dXTA_JO0J-FOoTT55YKuVGY9NKPs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
