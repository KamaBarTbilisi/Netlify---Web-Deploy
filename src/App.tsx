/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, useScroll, useTransform, useSpring } from "motion/react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, Environment, Float } from "@react-three/drei";
import React, { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import Papa from "papaparse";
import { BrowserRouter, Routes, Route, useNavigate, Link } from "react-router-dom";
import { 
  ChevronLeft, 
  ChevronRight, 
  X, 
  LogOut, 
  Settings,
  ArrowLeft,
  LogIn
} from "lucide-react";

const MENU_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQWkJMSOHk9DU0GtY_0XbHqG9eaYWqyqg5CDhiaaptCwO0clQ8zwkfFLFDnTaDKhhGVN9wBP68bSUUW/pub?output=csv";
const FAQ_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQWkJMSOHk9DU0GtY_0XbHqG9eaYWqyqg5CDhiaaptCwO0clQ8zwkfFLFDnTaDKhhGVN9wBP68bSUUW/pub?output=csv&sheet=FAQ";

const fetchProductsFromSheets = async (url: string): Promise<Product[]> => {
  try {
    const response = await fetch(url);
    const csvText = await response.text();
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const products: Product[] = (results.data as any[]).map((row: any, idx: number) => {
            const parseDescription = (val: string) => val ? val.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
            return {
              id: `sheet-${idx}`,
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
          resolve(products);
        },
        error: (err) => reject(err)
      });
    });
  } catch (e) {
    console.error("Error fetching products from sheets:", e);
    return [];
  }
};

const fetchFaqsFromSheets = async (url: string): Promise<FAQItem[]> => {
  try {
    const response = await fetch(url);
    const csvText = await response.text();
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = (results.data as any[]).slice(1);
          const faqs: FAQItem[] = rows.map((row: any, idx: number) => ({
            id: `sheet-faq-${idx}`,
            order: idx,
            en: { question: row[3] || "", answer: row[4] || "" },
            ka: { question: row[1] || "", answer: row[2] || "" }
          }));
          resolve(faqs);
        },
        error: (err) => reject(err)
      });
    });
  } catch (e) {
    console.error("Error fetching FAQs from sheets:", e);
    return [];
  }
};

const getRawGithubUrl = (url: string) => {
  if (!url) return "";
  if (url.includes("github.com") && url.includes("/blob/")) {
    return url
      .replace("github.com", "raw.githubusercontent.com")
      .replace("/blob/", "/");
  }
  return url;
};

function KamaModel({ scrollProgress }: { scrollProgress: any }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations, cameras } = useGLTF("https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/0b28c2abb186c13c9e3c12ef57eeca7557ce2701/Kama%20V13.glb");
  const { actions, names } = useAnimations(animations, group);
  const { set, size } = useThree();

  useEffect(() => {
    if (cameras && cameras.length > 0) {
      const cam = cameras[0] as THREE.PerspectiveCamera;
      if (cam.isPerspectiveCamera) {
        cam.aspect = size.width / size.height;
        cam.updateProjectionMatrix();
      }
      set({ camera: cam });
    }
  }, [cameras, set, size.width, size.height]);

  useEffect(() => {
    // Play the first animation if it exists
    if (names.length > 0 && actions[names[0]]) {
      const action = actions[names[0]]!;
      action.play();
      action.paused = true; // We will manually control the time
    }
  }, [actions, names]);

  useFrame(() => {
    if (names.length > 0 && actions[names[0]]) {
      const action = actions[names[0]]!;
      const duration = action.getClip().duration;
      // Map scroll progress (0-1) to animation time (0-duration)
      action.time = scrollProgress.get() * duration;
    }
  });

  return (
    <primitive 
      ref={group} 
      object={scene} 
      scale={4.5} 
      position={[0, 0, 0]}
      rotation={[0, 0, 0]}
    />
  );
}

function AnimatedGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  return <group ref={ref}>{children}</group>;
}

interface Product {
  id: string;
  created_at?: string;
  image: string;
  category_en: string;
  category_ka: string;
  order?: number;
  en: {
    name: string;
    description: string[];
    nutrition: string;
    category: string;
  };
  ka: {
    name: string;
    description: string[];
    nutrition: string;
    category: string;
  };
}


interface FAQItem {
  id: string;
  created_at?: string;
  order?: number;
  en: {
    question: string;
    answer: string;
  };
  ka: {
    question: string;
    answer: string;
  };
}

// MENU_DATA is now fetched dynamically from Google Sheets

function MenuCard({ product, lang }: { product: Product; lang: "en" | "ka" }) {
  const [isTapped, setIsTapped] = useState(false);
  const data = product[lang];

  return (
    <motion.div 
      className="flex flex-col w-full max-w-[360px] cursor-pointer"
      onClick={() => setIsTapped(!isTapped)}
      initial="initial"
      whileHover="hover"
      animate={isTapped ? "hover" : "initial"}
    >
      {/* Image Frame */}
      <div className="relative aspect-square rounded-[24px] overflow-hidden bg-zinc-900 mb-6">
        <motion.img 
          src={product.image}
          alt={data.name}
          className="w-full h-full object-cover"
          variants={{
            initial: { filter: "blur(0px) brightness(1)", scale: 1 },
            hover: { filter: "blur(8px) brightness(0.5)", scale: 1.05 }
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          referrerPolicy="no-referrer"
        />

        {/* Description Overlay (On Image) */}
        <motion.div 
          variants={{
            initial: { opacity: 0, y: 10 },
            hover: { opacity: 1, y: 0 }
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/40 backdrop-blur-[2px]"
        >
          <div className="space-y-1 overflow-y-auto max-h-full scrollbar-hide">
            {data.description.length > 6 || data.description.some(d => d.length > 25) ? (
              <p className="text-[10px] text-white font-albert font-medium tracking-[0.1em] uppercase leading-relaxed">
                {data.description.join(", ")}
              </p>
            ) : (
              data.description.map((item, i) => (
                <p key={i} className="text-[10px] text-white font-albert font-medium tracking-[0.2em] uppercase leading-relaxed">
                  {item}
                </p>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* Content Below */}
      <div className="px-1 mt-4">
        <h3 className="text-white font-albert font-bold text-base md:text-lg tracking-[0.1em] mb-2 uppercase leading-tight">
          {data.name || "Product Name"}
        </h3>
        <div className="space-y-1">
          <p className="text-[10px] text-white/40 font-albert font-medium tracking-[0.2em] uppercase leading-relaxed">
            {data.nutrition}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function MenuSection({ lang }: { lang: "en" | "ka" }) {
  const [menuData, setMenuData] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMenu = async () => {
      setLoading(true);
      try {
        const url = localStorage.getItem("sheet_url") || MENU_CSV_URL;
        const sheetData = await fetchProductsFromSheets(url);
        setMenuData(sheetData);
      } catch (err) {
        console.error("Error fetching menu:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMenu();
  }, []);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(menuData.map(p => p[lang === 'en' ? 'category_en' : 'category_ka']))).filter(Boolean);
    return cats;
  }, [menuData, lang]);

  if (loading) {
    return (
      <section className="relative z-[60] w-full py-32 px-4 md:px-10 bg-black min-h-screen flex items-center justify-center">
        <div className="text-white font-big-noodle text-2xl animate-pulse uppercase">
          {lang === "en" ? "LOADING MENU..." : "მენიუ იტვირთება..."}
        </div>
      </section>
    );
  }

  return (
    <section className="relative z-[60] w-full py-32 px-4 md:px-10 bg-black min-h-screen">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-col items-center mb-20">
          <h2 className="text-4xl md:text-6xl font-big-noodle font-normal tracking-normal text-white mb-12 uppercase">
            {lang === "en" ? "MENU" : "მენიუ"}
          </h2>
          
          {/* Category Navigation */}
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-8 sticky top-24 z-[70] bg-black/40 backdrop-blur-xl py-4 px-8 rounded-full border border-white/10 shadow-2xl">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => {
                  const element = document.getElementById(`category-${category}`);
                  if (element) {
                    const offset = 150;
                    const bodyRect = document.body.getBoundingClientRect().top;
                    const elementRect = element.getBoundingClientRect().top;
                    const elementPosition = elementRect - bodyRect;
                    const offsetPosition = elementPosition - offset;

                    window.scrollTo({
                      top: offsetPosition,
                      behavior: "smooth"
                    });
                  }
                }}
                className="text-[10px] font-bold tracking-[0.2em] text-white/60 hover:text-[#D4FF00] transition-all duration-300 uppercase whitespace-nowrap"
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-32">
          {categories.map((category) => (
            <div id={`category-${category}`} key={category} className="scroll-mt-32">
              <CategoryCarousel 
                category={category} 
                products={menuData.filter(p => p[lang].category === category)} 
                lang={lang} 
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryCarousel({ category, products, lang }: { category: string; products: Product[]; lang: "en" | "ka" }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const nextSlide = () => {
    if (currentIndex < products.length - 4) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const prevSlide = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  return (
    <div className="flex flex-col">
      <h3 className="text-[#D4FF00] font-big-noodle text-3xl md:text-5xl mb-10 uppercase tracking-wider">
        {category}
      </h3>

      <div className="relative group">
        {products.length > 4 && (
          <>
            <button 
              onClick={prevSlide}
              disabled={currentIndex === 0}
              className={`absolute left-[-60px] top-1/2 -translate-y-1/2 z-10 p-2 text-white transition-opacity hidden lg:block ${currentIndex === 0 ? 'opacity-0 pointer-events-none' : 'opacity-40 hover:opacity-100'}`}
            >
              <ChevronLeft size={48} />
            </button>
            <button 
              onClick={nextSlide}
              disabled={currentIndex >= products.length - 4}
              className={`absolute right-[-60px] top-1/2 -translate-y-1/2 z-10 p-2 text-white transition-opacity hidden lg:block ${currentIndex >= products.length - 4 ? 'opacity-0 pointer-events-none' : 'opacity-40 hover:opacity-100'}`}
            >
              <ChevronRight size={48} />
            </button>
          </>
        )}

        <div className="overflow-x-auto lg:overflow-hidden scrollbar-hide pb-4 -mx-4 px-4 md:-mx-10 md:px-10">
          <motion.div 
            ref={containerRef}
            className="flex gap-x-6 md:gap-x-10"
            animate={isDesktop ? { x: `-${currentIndex * (100 / 4)}%` } : { x: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            {products.map((product) => (
              <div key={product.id} className="flex-none w-[260px] sm:w-[300px] lg:w-[calc(25%-30px)]">
                <MenuCard product={product} lang={lang} />
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}


function FAQSection({ lang }: { lang: "en" | "ka" }) {
  const [faqData, setFaqData] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const fetchFaqs = async () => {
      setLoading(true);
      try {
        let url = localStorage.getItem("sheet_url") || MENU_CSV_URL;
        if (url.includes("docs.google.com/spreadsheets") && !url.includes("sheet=")) {
          url = url + "&sheet=FAQ";
        } else if (url === MENU_CSV_URL) {
          url = FAQ_CSV_URL;
        }
        
        const sheetData = await fetchFaqsFromSheets(url);
        setFaqData(sheetData);
      } catch (err) {
        console.error("Error fetching FAQs:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFaqs();
  }, []);

  if (loading) return null;
  
  if (faqData.length === 0) return null;

  return (
    <section className="w-full py-32 px-4 md:px-10 bg-black border-t border-white/5">
      <div className="max-w-[1000px] mx-auto">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-4xl md:text-6xl font-big-noodle font-normal tracking-normal text-white mb-20 uppercase text-center"
        >
          {lang === "en" ? "FREQUENTLY ASKED QUESTIONS" : "ხშირად დასმული კითხვები"}
        </motion.h2>

        <div className="space-y-4">
          {faqData.map((item, idx) => (
            <motion.div 
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="border-b border-white/10 overflow-hidden"
            >
              <button
                onClick={() => setOpenId(openId === item.id ? null : item.id)}
                className="w-full py-6 flex items-center justify-between text-left group"
              >
                <span className={`text-lg md:text-xl font-albert font-bold uppercase tracking-wider transition-colors duration-300 ${openId === item.id ? 'text-[#D4FF00]' : 'text-white group-hover:text-white/80'}`}>
                  {item[lang].question}
                </span>
                <motion.div
                  animate={{ rotate: openId === item.id ? 45 : 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-[#D4FF00] ml-4 flex-shrink-0"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="square"/>
                  </svg>
                </motion.div>
              </button>
              
              <motion.div
                initial={false}
                animate={{ 
                  height: openId === item.id ? "auto" : 0,
                  opacity: openId === item.id ? 1 : 0
                }}
                transition={{ duration: 0.4, ease: [0.04, 0.62, 0.23, 0.98] }}
              >
                <div className="pb-8 pr-12">
                  <p className="text-white/60 font-albert text-sm md:text-base leading-relaxed tracking-wide uppercase">
                    {item[lang].answer}
                  </p>
                </div>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AdminDashboard({ lang }: { lang: "en" | "ka" }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [activeTab, setActiveTab] = useState<"products" | "faqs">("products");
  const [isSyncing, setIsSyncing] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(localStorage.getItem("sheet_url") || "");
  const navigate = useNavigate();

  const fetchAdminData = useCallback(async () => {
    if (!sheetUrl) return;
    setIsSyncing(true);
    try {
      const pData = await fetchProductsFromSheets(sheetUrl);
      setProducts(pData);

      let faqUrl = sheetUrl;
      if (sheetUrl.includes("docs.google.com/spreadsheets") && !sheetUrl.includes("sheet=")) {
        faqUrl = sheetUrl + "&sheet=FAQ";
      }
      const fData = await fetchFaqsFromSheets(faqUrl);
      setFaqs(fData);
    } catch (err) {
      console.error("Error fetching admin data:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [sheetUrl]);

  useEffect(() => {
    const savedSession = localStorage.getItem("admin_logged_in");
    if (savedSession === "true") {
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      fetchAdminData();
    }
  }, [isLoggedIn, fetchAdminData]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === "admin" && password === "admin123") {
      localStorage.setItem("admin_logged_in", "true");
      setIsLoggedIn(true);
    } else {
      alert("Incorrect username or password");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_logged_in");
    setIsLoggedIn(false);
  };

  const syncFromSheets = async () => {
    if (!sheetUrl) {
      alert("Please provide a Google Sheets CSV URL first.");
      return;
    }
    
    localStorage.setItem("sheet_url", sheetUrl);
    setIsSyncing(true);
    try {
      const productsData = await fetchProductsFromSheets(sheetUrl);
      setProducts(productsData);

      let faqUrl = sheetUrl;
      if (sheetUrl.includes("docs.google.com/spreadsheets") && !sheetUrl.includes("sheet=")) {
        faqUrl = sheetUrl + "&sheet=FAQ";
      }
      const faqsData = await fetchFaqsFromSheets(faqUrl);
      setFaqs(faqsData);

      alert("Data synced successfully from Google Sheets!");
    } catch (error: any) {
      console.error("Sync error:", error);
      alert(`Sync failed: ${error.message || "Unknown error"}`);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 p-8 rounded-2xl border border-white/10 w-full max-w-md">
          <h2 className="text-2xl font-big-noodle text-white mb-6 uppercase tracking-widest text-center">ADMIN LOGIN</h2>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-2">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-white focus:border-[#D4FF00] outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] text-white/40 uppercase tracking-widest mb-2">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="admin123"
                className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-white focus:border-[#D4FF00] outline-none"
                required
              />
            </div>
            <button type="submit" className="w-full bg-[#D4FF00] text-black font-bold py-3 rounded-lg hover:bg-[#b8dd00] transition-colors uppercase tracking-widest mt-4">
              ENTER CMS
            </button>
          </form>
          <Link to="/" className="block text-center text-white/40 text-[10px] mt-6 uppercase tracking-widest hover:text-white">BACK TO SITE</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-10">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-6">
            <button onClick={() => navigate("/")} className="text-white/40 hover:text-white transition-colors">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-3xl md:text-5xl font-big-noodle uppercase tracking-widest">CMS DASHBOARD</h1>
          </div>
          <div className="flex flex-col md:flex-row gap-4 items-center flex-1 justify-end">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1 w-full max-w-md">
              <input 
                type="text" 
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="EXCEL CSV URL..."
                className="bg-transparent border-none outline-none text-[10px] font-bold uppercase tracking-widest text-white placeholder:text-white/20 flex-1"
              />
              <button 
                onClick={syncFromSheets}
                disabled={isSyncing}
                className="text-[#D4FF00] hover:text-white transition-colors disabled:opacity-50"
                title="Update from Excel"
              >
                <Settings size={14} className={isSyncing ? "animate-spin" : ""} />
              </button>
            </div>
            <button 
              onClick={handleLogout} 
              className="text-red-500 hover:text-red-400 transition-colors"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 border-b border-white/10">
          <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab("products")}
              className={`pb-4 px-4 text-xs font-bold tracking-[0.2em] uppercase transition-colors ${activeTab === "products" ? "text-[#D4FF00] border-b-2 border-[#D4FF00]" : "text-white/40 hover:text-white"}`}
            >
              PRODUCTS
            </button>
            <button 
              onClick={() => setActiveTab("faqs")}
              className={`pb-4 px-4 text-xs font-bold tracking-[0.2em] uppercase transition-colors ${activeTab === "faqs" ? "text-[#D4FF00] border-b-2 border-[#D4FF00]" : "text-white/40 hover:text-white"}`}
            >
              FAQ
            </button>
          </div>
          <button 
            onClick={syncFromSheets}
            disabled={isSyncing}
            className="pb-4 px-4 text-[10px] font-bold tracking-[0.2em] uppercase text-white/20 hover:text-[#D4FF00] transition-colors disabled:opacity-50"
          >
            {isSyncing ? "SYNCING..." : "SYNC FROM SHEETS"}
          </button>
        </div>

        {activeTab === "products" ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map(p => (
                <div key={p.id} className="bg-zinc-900 rounded-2xl border border-white/10 overflow-hidden group">
                  <div className="aspect-square relative">
                    <img src={p.image} className="w-full h-full object-cover" alt={p.en.name} />
                  </div>
                  <div className="p-4">
                    <h4 className="text-sm font-bold uppercase tracking-widest mb-1">{p.en.name}</h4>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest">{p.category_en}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="space-y-4">
              {faqs.map(f => (
                <div key={f.id} className="bg-zinc-900 p-6 rounded-2xl border border-white/10 flex justify-between items-center">
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-widest mb-2">{f.en.question}</h4>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest line-clamp-1">{f.en.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function LanguageSwitcher({ lang, setLang }: { lang: "en" | "ka"; setLang: (l: "en" | "ka") => void }) {
  return (
    <div className="fixed top-6 right-6 z-[100] flex gap-2">
      <button 
        onClick={() => setLang("en")}
        className={`px-3 py-1 text-[10px] font-bold tracking-widest uppercase transition-all duration-300 rounded-sm border ${lang === "en" ? "bg-[#D4FF00] text-black border-[#D4FF00]" : "text-white/40 border-white/10 hover:text-white"}`}
      >
        EN
      </button>
      <button 
        onClick={() => setLang("ka")}
        className={`px-3 py-1 text-[10px] font-bold tracking-widest uppercase transition-all duration-300 rounded-sm border ${lang === "ka" ? "bg-[#D4FF00] text-black border-[#D4FF00]" : "text-white/40 border-white/10 hover:text-white"}`}
      >
        GE
      </button>
    </div>
  );
}

function Footer({ lang }: { lang: "en" | "ka" }) {
  return (
    <footer className="relative z-[60] w-full py-20 px-4 md:px-10 bg-black border-t border-white/5">
      <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-12">
        <div className="flex flex-col items-center md:items-start">
          <img 
            src="https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/87b07ca5c7cd86f811cf6a7819f166f0d8dc086b/Section%201%20-%20Logo.svg"
            alt="Kama Logo"
            className="h-8 w-auto mb-8 opacity-50"
            referrerPolicy="no-referrer"
          />
          <p className="text-[10px] text-white/40 font-albert tracking-[0.2em] uppercase leading-relaxed text-center md:text-left">
            {lang === "en" 
              ? "KAMA BAR TBILISI. FRESH INGREDIENTS, BOLD FLAVORS. VISIT US FOR A UNIQUE CULINARY EXPERIENCE."
              : "კამა ბარი თბილისი. ახალი ინგრედიენტები, გამორჩეული გემოები. გვეწვიეთ უნიკალური კულინარიული გამოცდილებისთვის."}
          </p>
        </div>

        <div className="flex flex-col items-center">
          <h4 className="text-[#D4FF00] font-big-noodle text-2xl mb-6 uppercase tracking-wider">
            {lang === "en" ? "LOCATION" : "ლოკაცია"}
          </h4>
          <p className="text-[10px] text-white/60 font-albert tracking-[0.2em] uppercase text-center">
            {lang === "en" ? "TBILISI, GEORGIA" : "თბილისი, საქართველო"}
          </p>
        </div>

        <div className="flex flex-col items-center md:items-end">
          <h4 className="text-[#D4FF00] font-big-noodle text-2xl mb-6 uppercase tracking-wider">
            {lang === "en" ? "FOLLOW US" : "მოგვყევით"}
          </h4>
          <div className="flex gap-6">
            <a href="#" className="text-white/40 hover:text-white transition-colors text-[10px] font-bold tracking-[0.2em] uppercase">INSTAGRAM</a>
            <a href="#" className="text-white/40 hover:text-white transition-colors text-[10px] font-bold tracking-[0.2em] uppercase">FACEBOOK</a>
          </div>
        </div>
      </div>
      
      <div className="max-w-[1440px] mx-auto mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-[8px] text-white/20 font-albert tracking-[0.2em] uppercase">
          © 2026 KAMA BAR. ALL RIGHTS RESERVED.
        </p>
        <button 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="text-[8px] text-white/20 hover:text-white transition-colors font-albert tracking-[0.2em] uppercase"
        >
          {lang === "en" ? "BACK TO TOP ↑" : "ზემოთ დაბრუნება ↑"}
        </button>
      </div>
    </footer>
  );
}

function MainApp({ lang, setLang }: { lang: "en" | "ka"; setLang: (l: "en" | "ka") => void }) {
  const animationRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: animationRef,
    offset: ["start start", "end end"]
  });
  
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-red-500/30">
      <LanguageSwitcher lang={lang} setLang={setLang} />
      {/* Background Grid Lines */}
      <div className="fixed inset-0 pointer-events-none opacity-10 z-0 flex justify-center">
        <div className="h-full w-full max-w-[1440px] grid grid-cols-12 divide-x divide-white/20 border-x border-white/20">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-full" />
          ))}
        </div>
      </div>

      {/* Fixed 3D Model Container */}
      <motion.div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
        <div className="w-full h-full">
          <Canvas gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
            <Suspense fallback={null}>
              <ambientLight intensity={1.5} />
              <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} />
              <pointLight position={[-10, -10, -10]} intensity={1} />
              <Environment preset="city" />
              <AnimatedGroup>
                <KamaModel scrollProgress={smoothProgress} />
              </AnimatedGroup>
            </Suspense>
          </Canvas>
        </div>
      </motion.div>

      {/* Content Overlay */}
      <div className="relative z-10" ref={animationRef}>
        <main className="flex flex-col items-center pt-12 min-h-screen relative">
          <div className="w-full max-w-[1440px] mx-auto px-4 md:px-10 flex justify-between items-center">
            <Link to="/admin" className="text-[10px] text-white/20 hover:text-white transition-colors uppercase tracking-widest">
              <Settings size={16} />
            </Link>
            <motion.header initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
              <img 
                src="https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/87b07ca5c7cd86f811cf6a7819f166f0d8dc086b/Section%201%20-%20Logo.svg"
                alt="Kama Logo"
                className="h-12 md:h-16 w-auto"
                referrerPolicy="no-referrer"
              />
            </motion.header>
            <div className="w-8" /> {/* Spacer */}
          </div>

          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.8 }} className="w-full max-w-[1440px] mx-auto px-4 md:px-10 relative overflow-hidden">
            <div className="w-full relative overflow-hidden">
              <img 
                src="https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/87b07ca5c7cd86f811cf6a7819f166f0d8dc086b/Section%201%20-%20Hero%20image.png"
                alt="Kama Hero"
                className="w-full h-auto block"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-black/10" />
            </div>
          </motion.section>

          <div className="w-full max-w-[1440px] mx-auto grid grid-cols-2 gap-4 mt-6 px-4 md:px-10">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="flex flex-col justify-start">
              <div className="max-w-[320px] text-[10px] leading-[1.3] tracking-wider text-white/60 font-medium uppercase">
                <p>SEO TEXT BLOCK LEFT/ SEO TEXT BLOCK LEFT/ SEO TEXT BLOCK LEFT/ SEO TEXT BLOCK LEFT/ SEO TEXT BLOCK LEFT/ SEO TEXT BLOCK LEFT/ SEO TEXT BLOCK LEFT/ SEO TEXT BLOCK LEFT/</p>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="flex flex-col justify-start items-end">
              <div className="max-w-[320px] text-[10px] leading-[1.3] tracking-wider text-white/60 font-medium uppercase text-right">
                <p>SEO TEXT BLOCK RIGHT// SEO TEXT BLOCK RIGHT// SEO TEXT BLOCK RIGHT// SEO TEXT BLOCK RIGHT// SEO TEXT BLOCK RIGHT// SEO TEXT BLOCK RIGHT// SEO TEXT BLOCK RIGHT// SEO TEXT BLOCK RIGHT//</p>
              </div>
            </motion.div>
          </div>
        </main>

        <motion.section initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="w-full h-[300vh] mt-32 relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <img 
              src="https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/87b07ca5c7cd86f811cf6a7819f166f0d8dc086b/Fresh%201.png"
              alt="Decorative Line"
              className="h-full w-auto object-contain opacity-30"
              referrerPolicy="no-referrer"
            />
          </div>
          <motion.div animate={{ y: [0, -30, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} className="absolute top-[15%] left-[5%] md:left-[10%] z-20">
            <img src="https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/87b07ca5c7cd86f811cf6a7819f166f0d8dc086b/2%20phase.png" alt="Pumpkin" className="w-40 md:w-72 h-auto drop-shadow-2xl" referrerPolicy="no-referrer" />
          </motion.div>
          <motion.div animate={{ y: [0, -40, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }} className="absolute top-[45%] right-[5%] md:right-[10%] z-20">
            <img src="https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/87b07ca5c7cd86f811cf6a7819f166f0d8dc086b/1%20phase.png" alt="Tomato" className="w-40 md:w-72 h-auto drop-shadow-2xl" referrerPolicy="no-referrer" />
          </motion.div>
          <motion.div animate={{ y: [0, -25, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="absolute top-[75%] left-[5%] md:left-[15%] z-20">
            <img src="https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/87b07ca5c7cd86f811cf6a7819f166f0d8dc086b/3%20phase.png" alt="Mushrooms" className="w-40 md:w-72 h-auto drop-shadow-2xl" referrerPolicy="no-referrer" />
          </motion.div>
        </motion.section>
      </div>

      <div className="relative z-[60]">
        <MenuSection lang={lang} />
        <FAQSection lang={lang} />
        <Footer lang={lang} />
      </div>

      <div className="fixed bottom-6 right-6 z-50">
        <div className="bg-[#007AFF] px-3 py-1 text-[9px] font-bold text-white uppercase tracking-widest rounded-sm shadow-xl">
          1440 GRID
        </div>
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <h1 className="text-4xl font-big-noodle mb-4 uppercase text-[#D4FF00]">ERROR</h1>
            <p className="text-white/60 mb-8 uppercase tracking-widest text-xs leading-relaxed">Something went wrong.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-[#D4FF00] text-black px-8 py-3 rounded-full font-bold text-xs tracking-widest uppercase hover:bg-[#b8dd00] transition-colors"
            >
              RELOAD APP
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [lang, setLang] = useState<"en" | "ka">("en");

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainApp lang={lang} setLang={setLang} />} />
          <Route path="/admin" element={<AdminDashboard lang={lang} />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
