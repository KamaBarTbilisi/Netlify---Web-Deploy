
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://grxajpwbsbcilfwoecrm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyeGFqcHdic2JjaWxmd29lY3JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMzcwNzcsImV4cCI6MjA4OTkxMzA3N30.9L1IE2vhNYXHRZ_dXTA_JO0J-FOoTT55YKuVGY9NKPs';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data, error } = await supabase.from('products').select('*');
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Data:", data);
  }
}

check();
