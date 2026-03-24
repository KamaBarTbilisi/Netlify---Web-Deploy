-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  image TEXT,
  category_en TEXT,
  category_ka TEXT,
  "order" INTEGER,
  en JSONB NOT NULL DEFAULT '{}'::jsonb,
  ka JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Create faqs table
CREATE TABLE IF NOT EXISTS faqs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  "order" INTEGER,
  en JSONB NOT NULL DEFAULT '{}'::jsonb,
  ka JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Set up Row Level Security (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (No security as requested)
CREATE POLICY "Allow public all access on products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public all access on faqs" ON faqs FOR ALL USING (true) WITH CHECK (true);
