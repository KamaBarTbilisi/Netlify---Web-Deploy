
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';

const supabaseUrl = 'https://grxajpwbsbcilfwoecrm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyeGFqcHdic2JjaWxmd29lY3JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMzcwNzcsImV4cCI6MjA4OTkxMzA3N30.9L1IE2vhNYXHRZ_dXTA_JO0J-FOoTT55YKuVGY9NKPs';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MENU_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQWkJMSOHk9DU0GtY_0XbHqG9eaYWqyqg5CDhiaaptCwO0clQ8zwkfFLFDnTaDKhhGVN9wBP68bSUUW/pub?output=csv";
const FAQ_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQWkJMSOHk9DU0GtY_0XbHqG9eaYWqyqg5CDhiaaptCwO0clQ8zwkfFLFDnTaDKhhGVN9wBP68bSUUW/pub?output=csv&sheet=FAQ";

const getRawGithubUrl = (url: string) => {
  if (!url) return "";
  if (url.includes("github.com") && url.includes("/blob/")) {
    return url
      .replace("github.com", "raw.githubusercontent.com")
      .replace("/blob/", "/");
  }
  return url;
};

async function migrate() {
  console.log("Starting migration...");

  try {
    // 1. Fetch Products
    console.log("Fetching products from Google Sheets...");
    const prodRes = await fetch(MENU_CSV_URL);
    const prodCsv = await prodRes.text();
    const prodResults = Papa.parse(prodCsv, { header: true, skipEmptyLines: true });
    
    const products = (prodResults.data as any[]).map((row: any, idx: number) => {
      const parseDescription = (val: string) => val ? val.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
      return {
        image: getRawGithubUrl(row["Image Link"]),
        category_en: row["Category ENG"] || "",
        category_ka: row["Category GEO"] || "",
        order: idx,
        en: {
          name: row["Product name ENG"] || row["Product Name ENG"] || "",
          description: parseDescription(row["Description ENG"]),
          nutrition: row["Nutriotion ENG"] || row["Nutrition ENG"] || "",
          category: row["Category ENG"] || ""
        },
        ka: {
          name: row["Product name GEO"] || row["Product Name GEO"] || "",
          description: parseDescription(row["Description GEO"]),
          nutrition: row["Nutriotion GEO"] || row["Nutrition GEO"] || "",
          category: row["Category GEO"] || ""
        }
      };
    });
    console.log(`Fetched ${products.length} products.`);

    // 2. Fetch FAQs
    console.log("Fetching FAQs from Google Sheets...");
    const faqRes = await fetch(FAQ_CSV_URL);
    const faqCsv = await faqRes.text();
    const faqResults = Papa.parse(faqCsv, { header: false, skipEmptyLines: true });
    const faqRows = (faqResults.data as any[]).slice(1);
    
    const faqs = faqRows.map((row: any, idx: number) => ({
      order: idx,
      en: { question: row[3] || "", answer: row[4] || "" },
      ka: { question: row[1] || "", answer: row[2] || "" }
    }));
    console.log(`Fetched ${faqs.length} FAQs.`);

    // 3. Clear existing data
    console.log("Clearing existing data in Supabase...");
    await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('faqs').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 4. Insert Products
    console.log("Inserting products into Supabase...");
    const { error: prodErr } = await supabase.from('products').insert(products);
    if (prodErr) throw prodErr;

    // 5. Insert FAQs
    console.log("Inserting FAQs into Supabase...");
    const { error: faqErr } = await supabase.from('faqs').insert(faqs);
    if (faqErr) throw faqErr;

    console.log("Migration successful!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

migrate();
