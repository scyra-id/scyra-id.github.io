const SUPABASE_URL = 'https://qqouccbtjywanmgktdty.supabase.co/'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxb3VjY2J0anl3YW5tZ2t0ZHR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0MTc3NTEsImV4cCI6MjA5ODk5Mzc1MX0.H4kXB95hxQdJjqsqPZULGkHeXnUcIUVIFQ34L8Cidhs'; 

// Simpan koneksi ke window agar bisa dipakai di semua file JS
window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);