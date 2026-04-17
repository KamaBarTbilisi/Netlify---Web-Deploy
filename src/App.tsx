/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, useScroll, useTransform, useSpring, useMotionValueEvent, AnimatePresence } from "motion/react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, Environment, Float, OrbitControls, TransformControls } from "@react-three/drei";
import React, { Suspense, useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import { BrowserRouter, Routes, Route, useNavigate, Link, useLocation } from "react-router-dom";
import { 
  ChevronLeft, 
  ChevronRight, 
  X, 
  LogOut, 
  Settings,
  ArrowLeft,
  LogIn,
  Plus,
  Trash2,
  Save,
  Database,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Copy,
  RotateCcw,
  Check,
  MousePointer2,
  Link as LinkIcon,
  RefreshCw,
  Home,
  Info,
  Menu,
  Star,
  HelpCircle,
  Download,
  Github,
  ExternalLink
} from "lucide-react";
import initialContent from "./data/content.json";

const REVIEWS_BG = "https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/6ddad5ce2e8a52dc67a217c00d0cb975a149f20f/Reviews%20bacgkround.png";


const getRawGithubUrl = (url: string) => {
  if (!url) return null;
  if (url.includes("github.com") && url.includes("/blob/")) {
    const rawUrl = url
      .replace("github.com", "raw.githubusercontent.com")
      .replace("/blob/", "/");
    return rawUrl.replace(/ /g, "%20");
  }
  return url;
};

interface CameraKeyframe {
  percentage: number;
  position: [number, number, number];
  rotation: [number, number, number];
  fov: number;
  modelPosition?: [number, number, number];
  modelRotation?: [number, number, number];
  modelScale?: number;
}

const interpolateKeyframes = (keyframes: CameraKeyframe[], progress: number) => {
  const sorted = [...keyframes].sort((a, b) => a.percentage - b.percentage);
  if (sorted.length === 0) return null;

  let start = sorted[0];
  let end = sorted[sorted.length - 1];

  for (let i = 0; i < sorted.length - 1; i++) {
    if (progress >= sorted[i].percentage && progress <= sorted[i + 1].percentage) {
      start = sorted[i];
      end = sorted[i + 1];
      break;
    }
  }

  const range = end.percentage - start.percentage;
  const t = range === 0 ? 0 : (progress - start.percentage) / range;

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  return {
    camera: {
      position: [
        lerp(start.position[0], end.position[0], t),
        lerp(start.position[1], end.position[1], t),
        lerp(start.position[2], end.position[2], t)
      ] as [number, number, number],
      rotation: [
        lerp(start.rotation[0], end.rotation[0], t),
        lerp(start.rotation[1], end.rotation[1], t),
        lerp(start.rotation[2], end.rotation[2], t)
      ] as [number, number, number],
      fov: lerp(start.fov, end.fov, t)
    },
    model: start.modelPosition && end.modelPosition ? {
      position: [
        lerp(start.modelPosition[0], end.modelPosition[0], t),
        lerp(start.modelPosition[1], end.modelPosition[1], t),
        lerp(start.modelPosition[2], end.modelPosition[2], t)
      ] as [number, number, number],
      rotation: [
        lerp(start.modelRotation![0], end.modelRotation![0], t),
        lerp(start.modelRotation![1], end.modelRotation![1], t),
        lerp(start.modelRotation![2], end.modelRotation![2], t)
      ] as [number, number, number],
      scale: lerp(start.modelScale || 4.5, end.modelScale || 4.5, t)
    } : null
  };
};

interface EnvironmentSettings {
  url: string;
  intensity: number;
  blur: number;
  background: boolean;
  preset: string;
}

function CameraController({ 
  keyframes, 
  scrollProgress
}: { 
  keyframes: CameraKeyframe[], 
  scrollProgress: any
}) {
  const { camera } = useThree();
  
  useFrame(() => {
    // Normal scroll mode
    const progress = scrollProgress.get() * 100;
    const state = interpolateKeyframes(keyframes, progress);
    if (state) {
      camera.position.set(...state.camera.position);
      camera.rotation.set(...state.camera.rotation);
      if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        (camera as THREE.PerspectiveCamera).fov = state.camera.fov;
        (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
      }
    }
  });

  return null;
}

function KamaModel({ 
  scrollProgress, 
  glbUrl, 
  keyframes,
  activeEffect,
  globalMouse,
  onAnimationsLoaded,
  onLoad
}: { 
  scrollProgress: any, 
  glbUrl: string,
  keyframes: CameraKeyframe[],
  activeEffect: 'none' | 'mouse' | 'float' | 'both',
  globalMouse: { x: number, y: number },
  onAnimationsLoaded?: (names: string[]) => void,
  onLoad?: () => void
}) {
  const group = useRef<THREE.Group>(null);
  const fullUrl = getRawGithubUrl(glbUrl);
  
  const { scene, animations } = useGLTF(fullUrl);
  const { actions, names } = useAnimations(animations, scene);
  const { size } = useThree();

  useEffect(() => {
    if (onLoad) onLoad();
  }, [onLoad]);

  useEffect(() => {
    if (onAnimationsLoaded) {
      onAnimationsLoaded(names);
    }
  }, [names, onAnimationsLoaded]);

  // Viewport optimization: adjust scale based on aspect ratio
  const responsiveScale = (baseScale: number) => {
    const aspect = size.width / size.height;
    if (aspect < 1) { // Portrait (mobile)
      return baseScale * aspect * 1.2;
    }
    return baseScale;
  };

  useEffect(() => {
    // Play all animations if they exist
    names.forEach(name => {
      const action = actions[name];
      if (action) {
        action.play();
        action.paused = true; // We will manually control the time
      }
    });
  }, [actions, names]);

  const mouseRotation = useRef({ x: 0, y: 0 });

  useFrame((state) => {
    // 1. Animation Time Update for all animations
    names.forEach(name => {
      const action = actions[name];
      if (action) {
        const duration = action.getClip().duration;
        // Sync each animation to the scroll progress
        action.time = scrollProgress.get() * duration;
      }
    });

    // 2. Model Transform Interpolation
    if (group.current) {
      // In scroll mode, interpolate from keyframes using the shared helper
      const progress = scrollProgress.get() * 100;
      const interpolated = interpolateKeyframes(keyframes, progress);
      
      if (interpolated && interpolated.model) {
        // Base position and rotation from scroll
        const basePos = [...interpolated.model.position] as [number, number, number];
        const baseRot = [...interpolated.model.rotation] as [number, number, number];
        
        // --- Interactive Mouse Follow Effect ---
        const mouseX = globalMouse.x;
        const mouseY = globalMouse.y;
        
        const isMouseActive = activeEffect === 'mouse' || activeEffect === 'both';
        const isFloatActive = activeEffect === 'float' || activeEffect === 'both';

        // Smoothly interpolate mouse rotation offsets for a "heavy" feel
        const targetMouseRotX = isMouseActive ? -mouseY * 0.2 : 0; // Tilt up/down
        const targetMouseRotY = isMouseActive ? mouseX * 0.2 : 0;  // Turn left/right
        
        mouseRotation.current.x = THREE.MathUtils.lerp(mouseRotation.current.x, targetMouseRotX, 0.05);
        mouseRotation.current.y = THREE.MathUtils.lerp(mouseRotation.current.y, targetMouseRotY, 0.05);
        
        // --- Subtle Floating Effect ---
        const time = state.clock.getElapsedTime();
        const floatY = isFloatActive ? Math.sin(time * 1.5) * 0.05 : 0; // Subtle up/down float
        const floatRotZ = isFloatActive ? Math.cos(time * 1.2) * 0.02 : 0; // Subtle sway
        
        // Apply combined transforms
        group.current.position.set(
          basePos[0],
          basePos[1] + floatY,
          basePos[2]
        );
        
        group.current.rotation.set(
          baseRot[0] + mouseRotation.current.x,
          baseRot[1] + mouseRotation.current.y,
          baseRot[2] + floatRotZ
        );
        
        // Apply responsive adjustment to the interpolated scale
        const finalScale = responsiveScale(interpolated.model.scale);
        group.current.scale.setScalar(finalScale);
      }
    }
  });

  return (
    <primitive 
      ref={group} 
      object={scene} 
      name="kama-model-group"
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

interface Review {
  id: string;
  created_at?: string;
  order?: number;
  en: {
    name: string;
    text: string;
  };
  ka: {
    name: string;
    text: string;
  };
}

// MENU_DATA is now fetched dynamically from Google Sheets

function LazySection({ children, id, className, minHeight = "100vh" }: { children: React.ReactNode; id?: string; className?: string; minHeight?: string }) {
  return (
    <div id={id} className={className}>
      {children}
    </div>
  );
}

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
          src={getRawGithubUrl(product.image) || null}
          alt={data.name}
          className="w-full h-full object-cover"
          loading="lazy"
          width="360"
          height="360"
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

function MenuCategory({ category, items, lang }: { category: string, items: Product[], lang: "en" | "ka" }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = window.innerWidth < 768 ? 300 : 400;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div id={`category-${category}`} className="scroll-mt-32 relative group/category">
      <div className="flex justify-between items-end mb-12">
        <h3 className="text-[#D4FF00] font-big-noodle text-3xl md:text-5xl uppercase tracking-wider">
          {category}
        </h3>
        
        {/* Navigation Arrows */}
        <div className="flex gap-3 mb-2">
          <button 
            onClick={() => scroll('left')}
            className="p-2 md:p-3 border border-white/10 rounded-full text-white/40 hover:text-[#D4FF00] hover:border-[#D4FF00]/40 transition-all active:scale-95"
            aria-label="Scroll left"
          >
            <ChevronLeft size={20} className="md:w-6 md:h-6" />
          </button>
          <button 
            onClick={() => scroll('right')}
            className="p-2 md:p-3 border border-white/10 rounded-full text-white/40 hover:text-[#D4FF00] hover:border-[#D4FF00]/40 transition-all active:scale-95"
            aria-label="Scroll right"
          >
            <ChevronRight size={20} className="md:w-6 md:h-6" />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex gap-x-6 md:gap-x-10 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-8 -mx-4 px-4 md:mx-0 md:px-0"
      >
        {items.map((product) => (
          <div key={product.id} className="min-w-[280px] sm:min-w-[320px] md:min-w-[360px] snap-center">
            <MenuCard product={product} lang={lang} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MenuSection({ lang, menuData }: { lang: "en" | "ka"; menuData: Product[] }) {
  const categories = useMemo(() => {
    const cats = Array.from(new Set(menuData.map(p => p[lang === 'en' ? 'category_en' : 'category_ka']))).filter(Boolean);
    return cats;
  }, [menuData, lang]);

  if (menuData.length === 0) return null;

  return (
    <section id="menu" className="relative z-[120] w-full py-32 px-4 md:px-10 bg-black min-h-screen overflow-x-hidden" style={{ touchAction: 'pan-y' }}>
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-col items-center mb-20">
          <h2 className="text-3xl md:text-6xl font-big-noodle font-normal tracking-normal text-white mb-12 uppercase">
            {lang === "en" ? "MENU" : "მენიუ"}
          </h2>
          
          {/* Category Navigation */}
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-8 sticky top-24 z-[70] bg-black/40 backdrop-blur-xl py-4 px-8 rounded-full border border-white/10 shadow-2xl max-w-full overflow-x-hidden">
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
            <MenuCategory 
              key={category} 
              category={category} 
              items={menuData.filter(p => p[lang === 'en' ? 'category_en' : 'category_ka'] === category)} 
              lang={lang} 
            />
          ))}
        </div>
      </div>
    </section>
  );
}


function ReviewCard({ review, lang }: { review: Review; lang: "en" | "ka" }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="w-full p-8 rounded-[32px] bg-white/5 backdrop-blur-xl border border-white/10 flex flex-col gap-4 h-full aspect-[3/4]"
    >
      <div className="flex flex-col">
        <h4 className="text-[#D4FF00] font-big-noodle text-2xl uppercase tracking-wider">
          {review[lang].name}
        </h4>
      </div>
      <p className="text-white/80 font-albert text-sm leading-relaxed tracking-wide italic overflow-y-auto scrollbar-hide">
        "{review[lang].text}"
      </p>
    </motion.div>
  );
}

function ReviewSection({ lang, reviews }: { lang: "en" | "ka", reviews: Review[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 400;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  // Mouse drag to scroll implementation
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 2; // Scroll speed
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  if (reviews.length === 0) return null;

  return (
    <section id="reviews" className="relative z-[60] w-full py-32 min-h-screen flex items-center overflow-x-hidden" style={{ touchAction: 'pan-y' }}>
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <img 
          src={REVIEWS_BG} 
          alt="Reviews Background" 
          className="w-full h-full object-cover opacity-100"
          loading="lazy"
          width="1440"
          height="900"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black to-transparent" />
      </div>

      <div className="w-full relative z-10">
        <div className="max-w-[1440px] mx-auto px-4 md:px-10 flex flex-col items-center mb-20">
          <h2 className="text-3xl md:text-6xl font-big-noodle font-normal tracking-normal text-white mb-4 uppercase">
            {lang === "en" ? "REVIEWS" : "შეფასებები"}
          </h2>
          <div className="h-1 w-20 bg-[#D4FF00]" />
        </div>

        <div className="relative group">
          {/* Navigation Arrows */}
          <button 
            onClick={() => scroll('left')}
            className="absolute left-4 md:left-10 lg:left-[calc((100vw-1440px)/2+2.5rem)] top-1/2 -translate-y-1/2 z-20 p-2 text-white opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity hidden md:block"
          >
            <ChevronLeft size={48} />
          </button>
          <button 
            onClick={() => scroll('right')}
            className="absolute right-4 md:right-10 lg:right-[calc((100vw-1440px)/2+2.5rem)] top-1/2 -translate-y-1/2 z-20 p-2 text-white opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity hidden md:block"
          >
            <ChevronRight size={48} />
          </button>

          <div 
            ref={scrollRef}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            className={`w-full overflow-x-auto scrollbar-hide pb-10 px-4 md:px-10 lg:px-[calc((100vw-1440px)/2+2.5rem)] snap-x snap-mandatory ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
            style={{ touchAction: 'pan-x' }}
          >
            <div className="flex gap-8 min-w-max">
              {reviews.map((review) => (
                <div key={review.id} className="w-[300px] md:w-[350px] snap-center">
                  <ReviewCard review={review} lang={lang} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQSection({ lang, faqData }: { lang: "en" | "ka", faqData: FAQItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (!faqData || faqData.length === 0) return null;

  return (
    <section id="faq" className="relative z-[60] w-full py-32 px-4 md:px-10 bg-black border-t border-white/5 overflow-x-hidden" style={{ touchAction: 'pan-y' }}>
      <div className="max-w-[1000px] mx-auto">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-3xl md:text-6xl font-big-noodle font-normal tracking-normal text-white mb-20 uppercase text-center"
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

function AdminDashboard({ lang, data, setData }: { lang: "en" | "ka", data: any, setData: (d: any) => void }) {
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(sessionStorage.getItem("admin_auth") === "true");
  const [activeTab, setActiveTab] = useState<"hero" | "menu" | "faqs" | "reviews">("hero");
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  
  // GitHub Integration State
  const [githubToken, setGithubToken] = useState(localStorage.getItem("gh_token") || import.meta.env.VITE_GITHUB_TOKEN || "");
  const [githubRepo, setGithubRepo] = useState(localStorage.getItem("gh_repo") || "KamaBarTbilisi/Kama-Web-assets");
  const [githubPath, setGithubPath] = useState(localStorage.getItem("gh_path") || "content.json");
  const [showGithubSettings, setShowGithubSettings] = useState(false);

  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "Kama2233") {
      setIsAuthenticated(true);
      sessionStorage.setItem("admin_auth", "true");
    } else {
      setStatusMessage({ text: "WRONG PASSWORD", type: "error" });
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem("admin_auth");
  };

  const saveToGithub = async (updatedData: any) => {
    if (!githubToken) {
      setStatusMessage({ text: "GITHUB TOKEN REQUIRED", type: "error" });
      setShowGithubSettings(true);
      return;
    }

    setIsSyncing(true);
    try {
      // 1. Get current file SHA
      const getFileUrl = `https://api.github.com/repos/${githubRepo}/contents/${githubPath}`;
      const getRes = await fetch(getFileUrl, {
        headers: { Authorization: `token ${githubToken}` }
      });
      
      let sha = "";
      if (getRes.ok) {
        const fileData = await getRes.json();
        sha = fileData.sha;
      }

      // 2. Update file
      const putRes = await fetch(getFileUrl, {
        method: "PUT",
        headers: {
          Authorization: `token ${githubToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: `Update content via CMS: ${new Date().toISOString()}`,
          content: btoa(unescape(encodeURIComponent(JSON.stringify(updatedData, null, 2)))),
          sha: sha || undefined
        })
      });

      if (!putRes.ok) {
        const error = await putRes.json();
        throw new Error(error.message || "GITHUB API ERROR");
      }

      localStorage.setItem("gh_token", githubToken);
      localStorage.setItem("gh_repo", githubRepo);
      localStorage.setItem("gh_path", githubPath);
      
      setStatusMessage({ text: "PUSHED TO GITHUB SUCCESSFULLY! SITE WILL REBUILD.", type: "success" });
    } catch (err: any) {
      console.error(err);
      setStatusMessage({ text: `GITHUB PUSH FAILED: ${err.message}`, type: "error" });
    } finally {
      setIsSyncing(false);
    }
  };

  const downloadJson = (updatedData: any) => {
    const blob = new Blob([JSON.stringify(updatedData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "content.json";
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage({ text: "JSON DOWNLOADED. PLEASE COMMIT TO REPO MANUALLY.", type: "success" });
  };

  const handleBulkUpdate = async (type: "menu" | "faqs" | "reviews", tsvData: string) => {
    const rows = tsvData.split(/\r?\n/).filter(row => row.trim() !== "");
    const parsed = rows.map(row => row.split("\t").map(cell => cell.trim()));

    const newData = { ...data };

    if (type === "menu") {
      newData.products = parsed.map((row, idx) => {
        if (row.length < 9) return null;
        const [image, nameKa, descKa, nutriKa, nameEn, descEn, nutriEn, catKa, catEn] = row;
        return {
          id: Math.random().toString(36).substr(2, 9),
          image,
          category_ka: catKa,
          category_en: catEn,
          en: { 
            name: nameEn, 
            description: descEn.split(",").map(s => s.trim()).filter(Boolean), 
            nutrition: nutriEn, 
            category: catEn 
          },
          ka: { 
            name: nameKa, 
            description: descKa.split(",").map(s => s.trim()).filter(Boolean), 
            nutrition: nutriKa, 
            category: catKa 
          }
        };
      }).filter(Boolean);
    } else if (type === "faqs") {
      newData.faqs = parsed.map((row, idx) => {
        if (row.length < 4) return null;
        const [qEn, aEn, qKa, aKa] = row;
        return {
          id: Math.random().toString(36).substr(2, 9),
          order: idx,
          en: { question: qEn, answer: aEn },
          ka: { question: qKa, answer: aKa }
        };
      }).filter(Boolean);
    } else if (type === "reviews") {
      newData.reviews = parsed.map((row, idx) => {
        if (row.length < 4) return null;
        const [nEn, tEn, nKa, tKa] = row;
        return {
          id: Math.random().toString(36).substr(2, 9),
          en: { name: nEn, text: tEn },
          ka: { name: nKa, text: tKa }
        };
      }).filter(Boolean);
    }

    setData(newData);
    // Auto-save to GitHub if token exists, otherwise just update local state
    if (githubToken) {
      await saveToGithub(newData);
    } else {
      setStatusMessage({ text: "LOCAL STATE UPDATED. USE EXPORT TO SAVE PERMANENTLY.", type: "success" });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 p-8 rounded-2xl border border-white/10 w-full max-w-md">
          <h2 className="text-2xl font-big-noodle text-white mb-6 uppercase tracking-widest text-center">CMS LOGIN</h2>
          <form onSubmit={handleLogin}>
            <input 
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="ENTER PASSWORD..."
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-4 text-white outline-none focus:border-[#D4FF00] mb-4 text-center tracking-[0.5em]"
              autoFocus
            />
            <button 
              type="submit"
              className="w-full bg-[#D4FF00] text-black font-albert font-bold py-4 rounded-xl hover:bg-[#b8dd00] transition-colors uppercase tracking-widest"
            >
              ENTER
            </button>
          </form>
          <Link to="/" className="block text-center text-white/40 text-[10px] mt-6 uppercase tracking-widest hover:text-white">BACK TO SITE</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-10">
      <div className="max-w-[1200px] mx-auto">
        <div className="flex justify-between items-center mb-12">
          <div className="flex items-center gap-6">
            <button onClick={() => navigate("/")} className="text-white/40 hover:text-white transition-colors">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-3xl md:text-5xl font-big-noodle uppercase tracking-widest">CMS DASHBOARD</h1>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowGithubSettings(!showGithubSettings)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest ${showGithubSettings ? "bg-[#D4FF00] text-black" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
            >
              <Github size={14} />
              GitHub Settings
            </button>
            <button 
              onClick={() => downloadJson(data)}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
            >
              <Download size={14} />
              Export JSON
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </div>

        {showGithubSettings && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 p-6 bg-zinc-900 border border-[#D4FF00]/20 rounded-2xl space-y-4"
          >
            <div className="flex items-center gap-2 text-[#D4FF00] mb-4">
              <Settings size={16} />
              <h2 className="text-sm font-bold uppercase tracking-widest">GitHub Integration</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] text-white/40 uppercase tracking-widest">Personal Access Token</label>
                <input 
                  type="password" 
                  value={githubToken} 
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-[#D4FF00]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-white/40 uppercase tracking-widest">Repository (owner/repo)</label>
                <input 
                  type="text" 
                  value={githubRepo} 
                  onChange={(e) => setGithubRepo(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-[#D4FF00]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] text-white/40 uppercase tracking-widest">File Path</label>
                <input 
                  type="text" 
                  value={githubPath} 
                  onChange={(e) => setGithubPath(e.target.value)}
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-[#D4FF00]"
                />
              </div>
            </div>
            <p className="text-[9px] text-white/30 uppercase tracking-widest flex items-center gap-2">
              <Info size={10} />
              Changes will be committed directly to your repository. Netlify will auto-rebuild.
            </p>
          </motion.div>
        )}

        <div className="flex gap-4 mb-12 border-b border-white/10">
          {(["hero", "menu", "faqs", "reviews"] as const).map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 px-4 text-xs font-bold tracking-[0.2em] uppercase transition-colors ${activeTab === tab ? "text-[#D4FF00] border-b-2 border-[#D4FF00]" : "text-white/40 hover:text-white"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "hero" && (
          <div className="space-y-8">
            <div className="flex justify-between items-end">
              <div>
                <h3 className="text-[#D4FF00] font-big-noodle text-2xl uppercase tracking-widest">HERO SECTION</h3>
                <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">Manage Hero Image and SEO Text Blocks</p>
              </div>
              <button 
                onClick={() => saveToGithub(data)}
                disabled={isSyncing}
                className="bg-[#D4FF00] text-black px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#b8dd00] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Save size={14} />
                {isSyncing ? "SAVING..." : "SAVE CHANGES"}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6 bg-zinc-900 p-8 rounded-2xl border border-white/10">
              <div className="space-y-2">
                <label className="text-[10px] text-white/40 uppercase tracking-widest">Hero Image URL</label>
                <input 
                  type="text" 
                  value={data.hero?.image || ""} 
                  onChange={(e) => setData({ ...data, hero: { ...data.hero, image: e.target.value } })}
                  className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-[#D4FF00]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-white/5">
                <div className="space-y-6">
                  <h4 className="text-[10px] font-bold text-[#D4FF00] uppercase tracking-widest">English Content</h4>
                  <div className="space-y-2">
                    <label className="text-[10px] text-white/40 uppercase tracking-widest">SEO Text Left</label>
                    <textarea 
                      value={data.hero?.en?.seo_left || ""} 
                      onChange={(e) => setData({ ...data, hero: { ...data.hero, en: { ...data.hero?.en, seo_left: e.target.value } } })}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-[#D4FF00] min-h-[100px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-white/40 uppercase tracking-widest">SEO Text Right</label>
                    <textarea 
                      value={data.hero?.en?.seo_right || ""} 
                      onChange={(e) => setData({ ...data, hero: { ...data.hero, en: { ...data.hero?.en, seo_right: e.target.value } } })}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-[#D4FF00] min-h-[100px]"
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <h4 className="text-[10px] font-bold text-[#D4FF00] uppercase tracking-widest">Georgian Content</h4>
                  <div className="space-y-2">
                    <label className="text-[10px] text-white/40 uppercase tracking-widest">SEO ტექსტი მარცხნივ</label>
                    <textarea 
                      value={data.hero?.ka?.seo_left || ""} 
                      onChange={(e) => setData({ ...data, hero: { ...data.hero, ka: { ...data.hero?.ka, seo_left: e.target.value } } })}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-[#D4FF00] min-h-[100px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] text-white/40 uppercase tracking-widest">SEO ტექსტი მარჯვნივ</label>
                    <textarea 
                      value={data.hero?.ka?.seo_right || ""} 
                      onChange={(e) => setData({ ...data, hero: { ...data.hero, ka: { ...data.hero?.ka, seo_right: e.target.value } } })}
                      className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-[#D4FF00] min-h-[100px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "menu" && (
          <GridEditor 
            title="MENU (PRODUCTS)" 
            columns={["Image Link", "Product name GEO", "Description GEO", "Nutriotion GEO", "Product name ENG", "Description ENG", "Nutriotion ENG", "Category GEO", "Category ENG"]}
            initialData={data.products.map((p: any) => [
              p.image,
              p.ka.name,
              p.ka.description.join(", "),
              p.ka.nutrition,
              p.en.name,
              p.en.description.join(", "),
              p.en.nutrition,
              p.ka.category,
              p.en.category
            ])}
            columnOptions={{
              7: ["სალათი", "ბოული", "კრემ-სუპი", "სენდვიჩები"],
              8: ["Salad", "Bowl", "Cream-soup", "Sandwich"]
            }}
            onCellChange={(rIdx, cIdx, val, currentData) => {
              const newData = [...currentData];
              const categoryMap: { [key: string]: string } = {
                "Salad": "სალათი",
                "Bowl": "ბოული",
                "Cream-soup": "კრემ-სუპი",
                "Sandwich": "სენდვიჩები",
                "სალათი": "Salad",
                "ბოული": "Bowl",
                "კრემ-სუპი": "Cream-soup",
                "სენდვიჩები": "Sandwich"
              };
              
              if (cIdx === 7 && categoryMap[val]) {
                newData[rIdx][8] = categoryMap[val];
              } else if (cIdx === 8 && categoryMap[val]) {
                newData[rIdx][7] = categoryMap[val];
              }
              return newData;
            }}
            onSave={(tsv) => handleBulkUpdate("menu", tsv)}
            isSyncing={isSyncing}
          />
        )}

        {activeTab === "faqs" && (
          <GridEditor 
            title="FAQS" 
            columns={["Question ENG", "Answer ENG", "Question GEO", "Answer GEO"]}
            initialData={data.faqs.map((f: any) => [
              f.en.question,
              f.en.answer,
              f.ka.question,
              f.ka.answer
            ])}
            onSave={(tsv) => handleBulkUpdate("faqs", tsv)}
            isSyncing={isSyncing}
          />
        )}

        {activeTab === "reviews" && (
          <GridEditor 
            title="REVIEWS" 
            columns={["Name ENG", "Text ENG", "Name GEO", "Text GEO"]}
            initialData={data.reviews.map((r: any) => [
              r.en.name,
              r.en.text,
              r.ka.name,
              r.ka.text
            ])}
            onSave={(tsv) => handleBulkUpdate("reviews", tsv)}
            isSyncing={isSyncing}
          />
        )}

        {statusMessage && (
          <div className={`fixed bottom-10 right-10 z-[300] px-6 py-4 rounded-xl border shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-5 ${statusMessage.type === 'success' ? 'bg-green-500/10 border-green-500/50 text-green-500' : 'bg-red-500/10 border-red-500/50 text-red-500'}`}>
            <span className="text-[10px] font-bold uppercase tracking-widest">{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} className="hover:opacity-50">
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GridEditor({ 
  title, 
  columns, 
  initialData,
  onSave, 
  isSyncing,
  columnOptions,
  onCellChange
}: { 
  title: string; 
  columns: string[]; 
  initialData?: string[][];
  onSave: (data: string) => void;
  isSyncing: boolean;
  columnOptions?: { [key: number]: string[] };
  onCellChange?: (rowIndex: number, colIndex: number, value: string, gridData: string[][]) => string[][];
}) {
  const [gridData, setGridData] = useState<string[][]>(initialData && initialData.length > 0 ? initialData : [Array(columns.length).fill("")]);
  const [showConfirm, setShowConfirm] = useState(false);

  // We only initialize from initialData once on mount. 
  // We don't want to overwrite local edits if initialData changes in the parent 
  // (e.g. due to polling or other sections being saved) while the user is editing.

  const handlePaste = (e: React.ClipboardEvent, rowIndex: number, colIndex: number) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text");
    const rows = pastedText.split(/\r?\n/).filter(row => row.trim() !== "");
    let newData = [...gridData];

    rows.forEach((row, rIdx) => {
      const targetRowIndex = rowIndex + rIdx;
      if (!newData[targetRowIndex]) {
        newData[targetRowIndex] = Array(columns.length).fill("");
      }
      const cells = row.split("\t");
      cells.forEach((cell, cIdx) => {
        const targetColIndex = colIndex + cIdx;
        if (targetColIndex < columns.length) {
          const val = cell.trim();
          newData[targetRowIndex][targetColIndex] = val;
          if (onCellChange) {
            newData = onCellChange(targetRowIndex, targetColIndex, val, newData);
          }
        }
      });
    });

    setGridData(newData);
  };

  const handleChange = (rowIndex: number, colIndex: number, value: string) => {
    let newData = [...gridData];
    newData[rowIndex][colIndex] = value;
    if (onCellChange) {
      newData = onCellChange(rowIndex, colIndex, value, newData);
    }
    setGridData(newData);
  };

  const addRow = () => {
    setGridData([...gridData, Array(columns.length).fill("")]);
  };

  const removeRow = (index: number) => {
    if (gridData.length > 1) {
      setGridData(gridData.filter((_, i) => i !== index));
    }
  };

  const clearGrid = () => {
    setGridData([Array(columns.length).fill("")]);
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowIndex: number, colIndex: number) => {
    const { key } = e;
    const inputs = document.querySelectorAll('input[data-grid-input="true"]');
    const currentIndex = rowIndex * columns.length + colIndex;

    if (key === "ArrowDown") {
      e.preventDefault();
      const next = inputs[currentIndex + columns.length] as HTMLInputElement;
      if (next) next.focus();
    } else if (key === "ArrowUp") {
      e.preventDefault();
      const prev = inputs[currentIndex - columns.length] as HTMLInputElement;
      if (prev) prev.focus();
    } else if (key === "Enter") {
      e.preventDefault();
      const next = inputs[currentIndex + columns.length] as HTMLInputElement;
      if (next) {
        next.focus();
      } else {
        addRow();
        setTimeout(() => {
          const newInputs = document.querySelectorAll('input[data-grid-input="true"]');
          (newInputs[currentIndex + columns.length] as HTMLInputElement)?.focus();
        }, 0);
      }
    }
  };

  const handleSave = () => {
    const tsv = gridData
      .filter(row => row.some(cell => cell.trim() !== ""))
      .map(row => row.join("\t"))
      .join("\n");
    onSave(tsv);
    setShowConfirm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h3 className="text-[#D4FF00] font-big-noodle text-2xl uppercase tracking-widest">{title}</h3>
          <p className="text-white/40 text-[10px] uppercase tracking-widest mt-1">
            GRID EDITOR: PASTE INTO ANY CELL TO AUTO-FILL. ORDER: {columns.join(" | ")}
          </p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <button 
            onClick={clearGrid}
            className="bg-white/5 text-white/40 px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <RotateCcw size={14} />
            CLEAR ALL
          </button>
          {showConfirm ? (
            <div className="flex gap-2 flex-1 md:flex-none">
              <button 
                onClick={() => setShowConfirm(false)}
                className="bg-red-500/20 text-red-500 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-500/30 transition-colors"
              >
                CANCEL
              </button>
              <button 
                onClick={handleSave}
                disabled={isSyncing}
                className="bg-[#D4FF00] text-black px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#b8dd00] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Check size={14} />
                CONFIRM OVERWRITE
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowConfirm(true)}
              disabled={isSyncing}
              className="bg-[#D4FF00] text-black px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#b8dd00] transition-colors disabled:opacity-50 flex-1 md:flex-none flex items-center gap-2 justify-center"
            >
              <Save size={14} />
              UPDATE DATABASE
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto custom-scrollbar bg-zinc-900 border border-white/10 rounded-2xl">
        <table className="w-full border-collapse min-w-[1200px]">
          <thead>
            <tr className="border-b border-white/10">
              <th className="w-12 p-4 text-left text-[8px] text-white/20 uppercase tracking-widest">#</th>
              {columns.map((col, i) => (
                <th key={i} className="p-4 text-left text-[8px] text-white/40 uppercase tracking-widest border-l border-white/5">{col}</th>
              ))}
              <th className="w-12 p-4 border-l border-white/5"></th>
            </tr>
          </thead>
          <tbody>
            {gridData.map((row, rIdx) => (
              <tr key={rIdx} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="p-4 text-[10px] text-white/20 font-mono">{rIdx + 1}</td>
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="p-0 border-l border-white/5">
                    {columnOptions && columnOptions[cIdx] ? (
                      <select
                        value={cell}
                        onChange={(e) => handleChange(rIdx, cIdx, e.target.value)}
                        className="w-full bg-black/50 p-4 text-[10px] text-white outline-none focus:bg-white/[0.05] focus:text-[#D4FF00] transition-all appearance-none cursor-pointer"
                      >
                        <option value="">SELECT...</option>
                        {columnOptions[cIdx].map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input 
                        type="text"
                        data-grid-input="true"
                        value={cell}
                        onChange={(e) => handleChange(rIdx, cIdx, e.target.value)}
                        onPaste={(e) => handlePaste(e, rIdx, cIdx)}
                        onKeyDown={(e) => handleKeyDown(e, rIdx, cIdx)}
                        className="w-full bg-transparent p-4 text-[10px] text-white outline-none focus:bg-white/[0.05] focus:text-[#D4FF00] transition-all"
                        placeholder="..."
                      />
                    )}
                  </td>
                ))}
                <td className="p-4 border-l border-white/5">
                  <button 
                    onClick={() => removeRow(rIdx)}
                    className="text-white/20 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button 
        onClick={addRow}
        className="w-full py-4 border border-dashed border-white/10 rounded-xl text-white/40 text-[10px] font-bold uppercase tracking-widest hover:border-[#D4FF00] hover:text-[#D4FF00] transition-all flex items-center justify-center gap-2"
      >
        <Plus size={14} />
        ADD NEW ROW
      </button>

      <div className="flex justify-between items-center text-[8px] text-white/20 uppercase tracking-widest">
        <span>{gridData.filter(r => r.some(c => c.trim() !== "")).length} ROWS WITH DATA</span>
        <span>TIP: COPY FROM EXCEL AND PASTE INTO ANY CELL</span>
      </div>
    </div>
  );
}

function Navigation({ lang, showNav, activeSection }: { lang: "en" | "ka", showNav: boolean, activeSection: string }) {
  const navItems = [
    { label: lang === "en" ? "Home" : "მთავარი", id: "home" },
    { label: lang === "en" ? "How we do" : "როგორ", id: "how-we-do" },
    { label: lang === "en" ? "Menu" : "მენიუ", id: "menu" },
    { label: lang === "en" ? "Reviews" : "შეფასებები", id: "reviews" },
    { label: lang === "en" ? "FAQ" : "კითხვები", id: "faq" },
    { label: lang === "en" ? "Footer" : "ფუტერი", id: "footer" },
  ];

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ 
        opacity: showNav ? 1 : 0, 
        y: showNav ? 0 : -20,
        pointerEvents: showNav ? "auto" : "none"
      }}
      className="fixed top-auto md:top-0 bottom-0 md:bottom-auto left-0 w-full z-[150] flex justify-center p-2 md:p-6 pointer-events-none"
    >
      <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-full px-4 md:px-8 py-2 md:py-3 flex gap-4 md:gap-8 overflow-x-auto no-scrollbar max-w-[95%] h-fit pointer-events-auto">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => scrollTo(item.id)}
            className={`text-[8px] md:text-[10px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap ${activeSection === item.id ? 'text-[#D4FF00]' : 'text-white/60 hover:text-white'}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </motion.nav>
  );
}

function LanguageSwitcher({ lang, setLang }: { lang: "en" | "ka"; setLang: (l: "en" | "ka") => void }) {
  return (
    <div className="fixed top-4 right-4 md:top-6 md:right-6 z-[200] flex gap-2">
      <button 
        onClick={() => setLang("en")}
        className={`px-3 py-1 text-[10px] font-bold tracking-widest uppercase transition-all duration-300 rounded-sm border ${lang === "en" ? "bg-[#D4FF00] text-black border-[#D4FF00]" : "text-white/40 border-white/10 hover:text-white"}`}
        aria-label="Switch to English"
        lang="en"
      >
        EN
      </button>
      <button 
        onClick={() => setLang("ka")}
        className={`px-3 py-1 text-[10px] font-bold tracking-widest uppercase transition-all duration-300 rounded-sm border ${lang === "ka" ? "bg-[#D4FF00] text-black border-[#D4FF00]" : "text-white/40 border-white/10 hover:text-white"}`}
        aria-label="Switch to Georgian"
        lang="ka"
      >
        KA
      </button>
      {/* SEO hreflang links */}
      <link rel="alternate" hrefLang="en" href={`${window.location.origin}${window.location.pathname}?lang=en`} />
      <link rel="alternate" hrefLang="ka" href={`${window.location.origin}${window.location.pathname}?lang=ka`} />
    </div>
  );
}

function YoyoVideo({ src, className }: { src: string; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReversing, setIsReversing] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let rafId: number;

    const step = () => {
      if (isReversing) {
        if (video.currentTime <= 0.05) {
          setIsReversing(false);
          video.play().catch(() => {});
        } else {
          // Manually decrement currentTime to simulate reverse playback
          video.currentTime = Math.max(0, video.currentTime - 0.04);
        }
      }
      rafId = requestAnimationFrame(step);
    };

    if (isReversing) {
      video.pause();
      rafId = requestAnimationFrame(step);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isReversing]);

  return (
    <video
      ref={videoRef}
      src={src || null}
      className={className}
      muted
      playsInline
      autoPlay
      preload="auto"
      onEnded={() => setIsReversing(true)}
    />
  );
}

function Footer({ lang }: { lang: "en" | "ka" }) {
  return (
    <footer id="footer" className="relative z-[60] w-full py-10 lg:py-20 px-4 md:px-10 bg-black border-t border-white/5 overflow-x-hidden md:h-screen md:flex md:flex-col md:justify-between" style={{ touchAction: 'pan-y' }}>
      <div className="w-full md:max-w-5xl lg:w-1/2 mx-auto flex flex-col md:flex-row gap-10 items-center md:items-stretch justify-center md:flex-1">
        {/* Left Block: Video */}
        <div className="w-full h-[40vh] md:h-full lg:h-full md:aspect-auto md:w-[350px] lg:w-[450px]">
          <YoyoVideo 
            src={getRawGithubUrl("https://github.com/KamaBarTbilisi/Kama-Web-assets/blob/2976bf1b268ca8ad100fa5fc0451a064f0b0461b/Footer%2025%20Mart%20Video%20Webm%20v1%20no%20sound.webm")}
            className="w-full h-full object-cover rounded-[120px]"
          />
        </div>

        {/* Right Block: Logo and Info */}
        <div className="w-full md:w-fit md:flex-none flex flex-col justify-between gap-10 items-center md:items-stretch">
          {/* Logo */}
          <div className="flex justify-center md:justify-start">
            <img 
              src="https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/bfd4bbd55b0e1c7924367a6f14ef19cb04b5ff59/Section%201%20-%20Logo.svg"
              alt="Kama Logo"
              className="w-full max-w-[300px] h-auto"
              loading="lazy"
              width="300"
              height="110"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Location and Info */}
          <div className="flex flex-col sm:flex-row gap-6 items-center md:items-end">
            {/* Map */}
            <div className="w-1/2 aspect-square md:w-32 md:h-32 rounded-[20px] overflow-hidden flex-shrink-0 grayscale hover:grayscale-0 transition-all duration-500">
              <iframe 
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d190569.8124953695!2d44.80676346059476!3d41.72799915682046!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x40440dc1a907b385%3A0xf8eae755327fd611!2sKAMA!5e0!3m2!1sen!2sge!4v1774358965581!5m2!1sen!2sge" 
                width="100%" 
                height="100%" 
                style={{ border: 0 }} 
                allowFullScreen={true} 
                loading="lazy" 
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            {/* Text Info */}
            <div className="flex flex-col gap-2 text-[10px] font-albert uppercase tracking-widest text-white/60 text-center md:text-left">
              <p className="text-white">Tbilisi<br />Nikoladze street #4</p>
              <div className="mt-2 space-y-1">
                <p>+995 555184758</p>
                <p>Info@kamasaladbar.com</p>
              </div>
              <div className="mt-2 flex flex-col gap-1">
                <a href="https://www.instagram.com/kamatbilisi/" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Instagram</a>
                <a href="https://www.facebook.com/KAMATbilisi/" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Facebook</a>
                <a href="https://www.tiktok.com/@kamatbilisi" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Tiktok</a>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Navigation Footer */}
      <div className="max-w-[1440px] mx-auto mt-10 lg:mt-20 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8 text-[10px] font-albert uppercase tracking-widest text-white/60">
        <div className="flex flex-wrap justify-center md:justify-start gap-x-6 gap-y-3">
          <Link to="/" className="hover:text-white transition-colors">Home</Link>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="hover:text-white transition-colors">About us</button>
          <button onClick={() => document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Menu</button>
          <button onClick={() => document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Reviews</button>
          <button onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">FAQ</button>
        </div>
        <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-3">
          <a href="https://wolt.com/ka/geo/tbilisi/restaurant/kama" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Wolt</a>
          <a href="https://glovoapp.com/en/ge/tbilisi/stores/kama-bar-tbi" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Glovo</a>
          <a href="https://food.bolt.eu/ka-ge/15-tbilisi/p/168387-kama/" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">BoltFood</a>
        </div>
      </div>
      
      <div className="max-w-[1440px] mx-auto mt-4 lg:mt-8 pt-8 border-t border-white/5 flex flex-col items-center gap-6">
        <div className="flex flex-col md:flex-row justify-between items-center w-full gap-4">
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
        
        <div className="text-[8px] md:text-[10px] font-albert uppercase tracking-[0.2em] text-white/30 text-center">
          <p>Designed by <a href="https://verybad.agency/" target="_blank" rel="noreferrer" className="text-white/60 hover:text-[#D4FF00] transition-colors">Very bad agency | Digital pharmacy</a></p>
        </div>
      </div>
    </footer>
  );
}

function LoadingScreen() {
  const [progress, setProgress] = useState(0);
  const logoUrl = "https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/bfd4bbd55b0e1c7924367a6f14ef19cb04b5ff59/Section%201%20-%20Logo.svg";

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        const increment = Math.random() * 15;
        return Math.min(prev + increment, 100);
      });
    }, 400);
    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div 
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center overflow-hidden"
    >
      <div className="relative w-72 h-32 mb-12">
        {/* Background "Empty" Logo */}
        <div 
          className="absolute inset-0 bg-white/5"
          style={{
            maskImage: `url(${logoUrl})`,
            WebkitMaskImage: `url(${logoUrl})`,
            maskSize: 'contain',
            WebkitMaskSize: 'contain',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center'
          }}
        />

        {/* Filling "Primary" Logo */}
        <motion.div 
          className="absolute inset-0 bg-[#D4FF00] shadow-[0_0_30px_rgba(212,255,0,0.2)]"
          style={{
            maskImage: `url(${logoUrl})`,
            WebkitMaskImage: `url(${logoUrl})`,
            maskSize: 'contain',
            WebkitMaskSize: 'contain',
            maskRepeat: 'no-repeat',
            WebkitMaskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskPosition: 'center'
          }}
          initial={{ clipPath: 'inset(100% 0 0 0)' }}
          animate={{ clipPath: `inset(${100 - progress}% 0 0 0)` }}
          transition={{ duration: 0.5, ease: "linear" }}
        >
          {/* Enhanced Wave Layers */}
          <div 
            className="absolute left-[-50%] right-[-50%] w-[200%] h-[200%] pointer-events-none"
            style={{ 
              top: `${100 - progress}%`,
              transform: 'translateY(-50%)'
            }}
          >
            {/* Wave 1 */}
            <motion.div 
              className="absolute top-0 left-0 w-full h-full bg-[#D4FF00] opacity-40 rounded-[40%]"
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            />
            {/* Wave 2 */}
            <motion.div 
              className="absolute top-0 left-0 w-full h-full bg-[#D4FF00] opacity-60 rounded-[45%]"
              animate={{ rotate: -360 }}
              transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
            />
            {/* Wave 3 */}
            <motion.div 
              className="absolute top-0 left-0 w-full h-full bg-[#D4FF00] opacity-30 rounded-[35%]"
              animate={{ rotate: 180 }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </motion.div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <p className="text-[14px] font-mono text-[#D4FF00] font-bold tracking-[0.3em]">
            {Math.floor(progress).toString().padStart(3, '0')}%
          </p>
          <motion.div 
            className="absolute -bottom-2 left-0 h-[1px] bg-[#D4FF00]/30"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Decorative background elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(212,255,0,0.03)_0%,transparent_70%)]" />
      </div>
    </motion.div>
  );
}

function MainApp({ lang, setLang, data }: { lang: "en" | "ka"; setLang: (l: "en" | "ka") => void; data: any }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  
  useEffect(() => {
    if (isModelLoaded) {
      const timer = setTimeout(() => setIsLoading(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [isModelLoaded]);

  const heroAndStepsRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroAndStepsRef,
    offset: ["start start", "end end"]
  });
  
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const GLB_URL = "https://github.com/KamaBarTbilisi/Kama-Web-assets/blob/c93b4f998bbf7665dc21b1779b90763405615bc5/Kama%20V32.glb";

  const [animationNames, setAnimationNames] = useState<string[]>([]);
  const [shouldLoadModel, setShouldLoadModel] = useState(false);
  const menuData = data.products || [];
  const faqData = data.faqs || [];
  const reviews = data.reviews || [];
  const heroData = data.hero || {
    image: "https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/87b07ca5c7cd86f811cf6a7819f166f0d8dc086b/Section%201%20-%20Hero%20image.png",
    en: { seo_left: "", seo_right: "" },
    ka: { seo_left: "", seo_right: "" }
  };

  useEffect(() => {
    // Defer 3D model loading to prioritize LCP
    const timer = setTimeout(() => setShouldLoadModel(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getDeviceType = () => {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  };

  const getInitialKeyframes = (): CameraKeyframe[] => {
    const device = getDeviceType();
    if (device === 'tablet') {
      return [
        {
          percentage: 0,
          position: [0, 0, 5] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          fov: 27,
          modelPosition: [0, -0.9, 0],
          modelRotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793],
          modelScale: 4.500000000000001
        },
        {
          percentage: 100,
          position: [0, 0, 5] as [number, number, number],
          rotation: [0, 0, 0] as [number, number, number],
          fov: 27,
          modelPosition: [0, -0.9, 0],
          modelRotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793],
          modelScale: 4.500000000000001
        }
      ];
    }
    // Default / Desktop
    return [
      {
        percentage: 0,
        position: [0, 0, 5] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        fov: 27,
        modelPosition: [0, -0.9, 0],
        modelRotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793],
        modelScale: 4.500000000000001
      },
      {
        percentage: 26,
        position: [0, 0, 5] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        fov: 27,
        modelPosition: [0, -0.9, 0],
        modelRotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793],
        modelScale: 4.500000000000001
      },
      {
        percentage: 50,
        position: [0, 0, 5] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        fov: 27,
        modelPosition: [0, -0.9, 0],
        modelRotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793],
        modelScale: 4.500000000000001
      },
      {
        percentage: 75,
        position: [0, 0, 5] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        fov: 27,
        modelPosition: [0, -0.9, 0],
        modelRotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793],
        modelScale: 4.500000000000001
      },
      {
        percentage: 100,
        position: [0, 0, 5] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        fov: 27,
        modelPosition: [0, -0.9, 0],
        modelRotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793],
        modelScale: 4.500000000000001
      }
    ];
  };

  const initialKeyframes = getInitialKeyframes();
  const [keyframes, setKeyframes] = useState<CameraKeyframe[]>(initialKeyframes);
  const [activeEffect, setActiveEffect] = useState<'none' | 'mouse' | 'float' | 'both'>('both');
  const [globalMouse, setGlobalMouse] = useState({ x: 0, y: 0 });
  const [showNav, setShowNav] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    if (latest > window.innerHeight * 0.8) {
      setShowNav(true);
    } else {
      setShowNav(false);
    }
  });

  useEffect(() => {
    const sections = ['home', 'how-we-do', 'menu', 'reviews', 'faq', 'footer'];
    const observerOptions = {
      root: null,
      rootMargin: '-50% 0px',
      threshold: 0
    };

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Dynamic SEO Metadata
    const titles = {
      en: "Kama - Healthy Salad Bar & Protein Bowls in Tbilisi",
      ka: "კამა - ჯანსაღი კვება და ბოულები თბილისში"
    };
    const descriptions = {
      en: "Discover the freshest protein-rich bowls and salads in Tbilisi. Healthy food delivery or visit us at 5 Niko Nikoladze St.",
      ka: "აღმოაჩინეთ ყველაზე ახალი ბოულები და სალათები თბილისში. ჯანსაღი კვება ნიკოლაძის 5-ში."
    };

    document.title = titles[lang];
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", descriptions[lang]);
    }
    
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", titles[lang]);
    
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", descriptions[lang]);

  }, [lang]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setGlobalMouse({
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -(e.clientY / window.innerHeight) * 2 + 1
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setKeyframes(getInitialKeyframes());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [glbUrl, setGlbUrl] = useState(GLB_URL);
  const [envSettings] = useState<EnvironmentSettings>({
    url: "",
    intensity: 1,
    blur: 0,
    background: false,
    preset: "city"
  });

  const stepsRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: stepsProgress } = useScroll({
    target: stepsRef,
    offset: ["start start", "end end"]
  });

  const modelOpacity = 1;

  // Story background opacity: fades in at start of story
  const storyBgOpacity = useTransform(stepsProgress, [0, 0.05], [0, 1]);

  return (
    <div className="min-h-screen w-full max-w-full bg-black text-white font-sans selection:bg-red-500/30 overflow-x-hidden relative" style={{ touchAction: 'pan-y' }}>
      <AnimatePresence>
        {isLoading && <LoadingScreen key="loader" />}
      </AnimatePresence>
      
      <Navigation lang={lang} showNav={showNav} activeSection={activeSection} />
      {/* Background Grid Lines */}
      <div className="fixed inset-0 pointer-events-none opacity-10 z-0 flex justify-center overflow-hidden">
        <div className="h-full w-full max-w-[1440px] grid grid-cols-12 divide-x divide-white/20 border-x border-white/20">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-full" />
          ))}
        </div>
      </div>

      {/* Story Background Image (Behind Model) */}
      <motion.div 
        style={{ 
          opacity: storyBgOpacity,
        }}
        className="fixed inset-0 z-10 pointer-events-none flex items-center justify-center overflow-hidden"
      >
        <img 
          src={getRawGithubUrl("https://github.com/KamaBarTbilisi/Kama-Web-assets/blob/370fdbc8def7bb1a1bc74ae63ad91b4e8df40687/Fresh%201.png")}
          alt="Story Background"
          className="h-screen w-12 md:w-16 object-cover"
          referrerPolicy="no-referrer"
          width="48"
          height="823"
          loading="lazy"
        />
      </motion.div>

      {/* Fixed 3D Model Container */}
      <motion.div 
        style={{ 
          opacity: modelOpacity,
        }}
        className="fixed inset-0 flex items-center justify-center overflow-hidden transition-all duration-300 z-20 pointer-events-none"
      >
        <div className="w-full h-full">
          {shouldLoadModel && (
            <Canvas 
              gl={{ 
                alpha: true, 
                antialias: false, // Disable antialiasing on mobile for performance
                powerPreference: "high-performance",
                stencil: false,
                depth: true
              }} 
              dpr={window.innerWidth < 768 ? 1 : [1, 1.5]}
              camera={{ position: [0, 0, 5], fov: 75 }}
            >
              <CameraController 
                keyframes={keyframes} 
                scrollProgress={smoothProgress}
              />
              <Suspense fallback={null}>
                <ambientLight intensity={1.5} />
                <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={2} />
                <pointLight position={[-10, -10, -10]} intensity={1} />
                <Environment 
                  preset={envSettings.preset as any} 
                  files={envSettings.url ? getRawGithubUrl(envSettings.url) : undefined}
                  background={envSettings.background}
                  blur={envSettings.blur}
                  environmentIntensity={envSettings.intensity}
                />
                <AnimatedGroup>
                  <KamaModel 
                    scrollProgress={smoothProgress} 
                    glbUrl={glbUrl} 
                    keyframes={keyframes}
                    activeEffect={activeEffect}
                    globalMouse={globalMouse}
                    onAnimationsLoaded={setAnimationNames}
                    onLoad={() => setIsModelLoaded(true)}
                  />
                </AnimatedGroup>
              </Suspense>
            </Canvas>
          )}
        </div>
      </motion.div>

      {/* Snap Container */}
      <div className="w-full max-w-full" style={{ touchAction: 'pan-y' }}>
        <div ref={heroAndStepsRef} style={{ touchAction: 'pan-y' }}>
          {/* Section 1: Hero */}
          <section id="home" className="snap-section pt-12 relative z-10 transform-gpu translate-z-0">
            <main className="flex flex-col items-center h-full relative">
              <h1 className="sr-only">
                {lang === "en" ? "Kama - Healthy Salad Bar & Protein Bowls in Tbilisi" : "კამა - ჯანსაღი კვება და ბოულები თბილისში"}
              </h1>
              <div className="w-full max-w-[1440px] mx-auto px-4 md:px-10 flex justify-center items-center">
                <motion.header initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
                  <img 
                    src="https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/bfd4bbd55b0e1c7924367a6f14ef19cb04b5ff59/Section%201%20-%20Logo.svg"
                    alt="Kama Logo"
                    className="h-12 md:h-16 w-auto max-w-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </motion.header>
                <div className="w-8" /> {/* Spacer */}
              </div>

              <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.8 }} className="w-full max-w-[1440px] mx-auto px-4 md:px-10 relative overflow-hidden flex-1 flex items-center">
                <div className="w-full relative overflow-hidden">
                  <img 
                    src={getRawGithubUrl(heroData.image)}
                    alt="Kama Hero"
                    className="w-full h-auto block"
                    referrerPolicy="no-referrer"
                    width="1297"
                    height="495"
                    loading="eager"
                    fetchPriority="high"
                  />
                  <div className="absolute inset-0 bg-black/10" />
                </div>
              </motion.section>

              <div className="w-full max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-4 pb-12 px-4 md:px-10">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="flex flex-col justify-start">
                  <div className="max-w-full md:max-w-[320px] text-[10px] leading-[1.3] tracking-wider text-white/60 font-medium uppercase break-words">
                    <p>{heroData[lang]?.seo_left || ""}</p>
                  </div>
                </motion.div>
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }} className="flex flex-col justify-start items-start md:items-end">
                  <div className="max-w-full md:max-w-[320px] text-[10px] leading-[1.3] tracking-wider text-white/60 font-medium uppercase text-left md:text-right break-words">
                    <p>{heroData[lang]?.seo_right || ""}</p>
                  </div>
                </motion.div>
              </div>
            </main>
          </section>

          {/* Story Section: 3 Phase Steps */}
          <div id="how-we-do" className="relative z-[100] transform-gpu translate-z-0" ref={stepsRef}>
            {/* Phase 1 */}
            <section className="snap-section h-screen flex justify-end items-center p-8 md:p-20 relative overflow-x-hidden">
              <div className="z-[110] text-right">
                <h2 className="text-5xl md:text-9xl font-sans font-black text-[#D4FF00] uppercase tracking-tighter leading-none break-words">
                  CAREFULLY<br/>SELECTED
                </h2>
              </div>
            </section>

            {/* Phase 2 */}
            <section className="snap-section h-screen flex justify-end items-center p-8 md:p-20 relative overflow-x-hidden">
              <div className="z-[110] text-right">
                <h2 className="text-5xl md:text-9xl font-sans font-black text-[#D4FF00] uppercase tracking-tighter leading-none break-words">
                  DEFINED<br/>BY TASTE
                </h2>
              </div>
            </section>

            {/* Phase 3 */}
            <section className="snap-section h-screen flex justify-end items-center p-8 md:p-20 relative overflow-x-hidden">
              <div className="z-[110] text-right">
                <h2 className="text-5xl md:text-9xl font-sans font-black text-[#D4FF00] uppercase tracking-tighter leading-none break-words">
                  FINISH WITH<br/>A SHAKE
                </h2>
              </div>
            </section>
            
            <div className="absolute inset-0 pointer-events-none">
              <div className="sticky top-0 h-screen w-full overflow-hidden">
                {/* Progress Indicator */}
                <div className="absolute right-4 md:right-10 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-40">
                  {[0, 1, 2].map((i) => (
                    <motion.div 
                      key={i}
                      className="w-1 h-12 bg-white/10 rounded-full overflow-hidden"
                    >
                      <motion.div 
                        className="w-full h-full bg-[#D4FF00]"
                        style={{ 
                          scaleY: useTransform(stepsProgress, [i/3, (i+1)/3], [0, 1]),
                          originY: 0
                        }}
                      />
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Other Sections */}
        <LazySection id="menu" className="snap-section h-auto min-h-0 lg:min-h-screen bg-black z-[120] relative transform-gpu translate-z-0">
          <MenuSection lang={lang} menuData={menuData} />
        </LazySection>
        <LazySection id="reviews" className="snap-section h-auto min-h-0 lg:min-h-screen bg-black z-[120] relative transform-gpu translate-z-0">
          <ReviewSection lang={lang} reviews={data.reviews} />
        </LazySection>
        <LazySection id="faq" className="snap-section h-auto min-h-0 lg:min-h-screen bg-black z-[120] relative transform-gpu translate-z-0">
          <FAQSection lang={lang} faqData={data.faqs} />
        </LazySection>
        <LazySection id="footer" className="snap-section h-auto md:h-screen min-h-0 bg-black z-[120] relative transform-gpu translate-z-0">
          <Footer lang={lang} />
        </LazySection>
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
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        if (parsed.error) {
          errorMessage = `Firestore Error: ${parsed.error}`;
        }
      } catch (e) {
        errorMessage = this.state.error.message || "Something went wrong.";
      }

      return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center p-8 text-center">
          <div className="max-w-md">
            <h1 className="text-4xl font-big-noodle mb-4 uppercase text-[#D4FF00]">ERROR</h1>
            <p className="text-white/60 mb-8 uppercase tracking-widest text-xs leading-relaxed">{errorMessage}</p>
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
  const [data, setData] = useState(initialContent);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppContent 
          lang={lang} 
          setLang={setLang} 
          data={data}
          setData={setData}
        />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

function AppContent({ 
  lang, 
  setLang, 
  data,
  setData
}: { 
  lang: "en" | "ka"; 
  setLang: (l: "en" | "ka") => void; 
  data: any;
  setData: (d: any) => void;
}) {
  const location = useLocation();
  const isAdmin = location.pathname === "/admin";
  const hasFetched = useRef(false);

  useEffect(() => {
    const fetchContent = async (isInitial = false) => {
      // If we are in admin mode, only fetch if we haven't fetched anything yet
      if (isAdmin && hasFetched.current && !isInitial) {
        return;
      }
      
      try {
        const repo = localStorage.getItem("gh_repo") || "KamaBarTbilisi/Kama-Web-assets";
        const path = localStorage.getItem("gh_path") || "content.json";
        const response = await fetch(`https://raw.githubusercontent.com/${repo}/main/${path}?t=${Date.now()}`);
        if (response.ok) {
          const json = await response.json();
          setData(json);
          hasFetched.current = true;
        }
      } catch (err) {
        console.error("Failed to fetch live content from GitHub:", err);
      }
    };

    // Initial fetch on mount or when entering admin mode (if not already fetched)
    if (!hasFetched.current || !isAdmin) {
      fetchContent(true);
    }
    
    // Only poll if NOT in admin mode
    let interval: NodeJS.Timeout;
    if (!isAdmin) {
      interval = setInterval(() => fetchContent(false), 60000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [setData, isAdmin]); // Removed 'data' from dependencies to avoid infinite loops or excessive runs

  return (
    <>
      <div className="noise-overlay" />
      <LanguageSwitcher lang={lang} setLang={setLang} />
      <Routes>
        <Route path="/" element={<MainApp lang={lang} setLang={setLang} data={data} />} />
        <Route path="/admin" element={<AdminDashboard lang={lang} data={data} setData={setData} />} />
      </Routes>
    </>
  );
}
