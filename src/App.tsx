/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, useScroll, useTransform, useSpring } from "motion/react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, useAnimations, Environment, Float, OrbitControls, TransformControls } from "@react-three/drei";
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
  LogIn,
  Plus,
  Trash2,
  Save,
  Database,
  Loader2,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Copy,
  RotateCcw,
  Check,
  MousePointer2,
  Link as LinkIcon,
  RefreshCw
} from "lucide-react";
import { db, auth, googleProvider, handleFirestoreError, OperationType } from "./firebase";
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  serverTimestamp,
  getDocs
} from "firebase/firestore";
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  User
} from "firebase/auth";

const MENU_CSV_URL = "https://docs.google.com/spreadsheets/d/13fg0K72AoZziXeQ5WOV8OCC6kF4Si6UtfL5sIipwC7c/export?format=csv&gid=876610475";
const FAQ_CSV_URL = "https://docs.google.com/spreadsheets/d/13fg0K72AoZziXeQ5WOV8OCC6kF4Si6UtfL5sIipwC7c/export?format=csv&gid=642046197";

// Fallback to the Cloud Run URL if VITE_API_URL is not set on Netlify
const CLOUD_RUN_URL = "https://ais-dev-jv6m77wpjn2fq4n554gd5m-95396215977.europe-west2.run.app";
const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname.includes('netlify.app') ? CLOUD_RUN_URL : "");
console.log("API_URL configured as:", API_URL || "(local)");

const fetchProductsFromSheets = async (url: string): Promise<Product[]> => {
  try {
    const proxyUrl = `${API_URL}/api/proxy-sheets?url=${encodeURIComponent(getExportUrl(url, "menu"))}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error("Failed to fetch via proxy");
    const csvText = await response.text();
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const products: Product[] = (results.data as any[]).map((row: any, idx: number) => {
            const parseDescription = (val: string) => val ? val.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
            const getVal = (keys: string[]) => {
              for (const key of keys) {
                if (row[key] !== undefined) return row[key];
                // Try case-insensitive
                const foundKey = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
                if (foundKey) return row[foundKey];
              }
              return "";
            };

            return {
              id: `sheet-${idx}`,
              image: getRawGithubUrl(getVal(["Image Link", "Image", "Link"])),
              category_en: getVal(["Category ENG", "Category EN", "Category"]),
              category_ka: getVal(["Category GEO", "Category KA", "Category GE"]),
              order: idx,
              en: {
                name: getVal(["Product name ENG", "Product Name ENG", "Name EN", "Name"]),
                description: parseDescription(getVal(["Description ENG", "Description EN", "Description"])),
                nutrition: getVal(["Nutriotion ENG", "Nutrition ENG", "Nutrition EN", "Nutrition"]),
                category: getVal(["Category ENG", "Category EN", "Category"])
              },
              ka: {
                name: getVal(["Product name GEO", "Product Name GEO", "Name GEO", "Name KA"]),
                description: parseDescription(getVal(["Description GEO", "Description KA", "Description GE"])),
                nutrition: getVal(["Nutriotion GEO", "Nutrition GEO", "Nutrition KA", "Nutrition GE"]),
                category: getVal(["Category GEO", "Category KA", "Category GE"])
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
    const proxyUrl = `${API_URL}/api/proxy-sheets?url=${encodeURIComponent(getExportUrl(url, "faq"))}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) throw new Error("Failed to fetch via proxy");
    const csvText = await response.text();
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = (results.data as any[]).slice(1);
          const faqs: FAQItem[] = rows.map((row: any, idx: number) => {
            // If row is an array (header: false)
            if (Array.isArray(row)) {
              return {
                id: `sheet-faq-${idx}`,
                order: idx,
                en: { question: row[3] || "", answer: row[4] || "" },
                ka: { question: row[1] || "", answer: row[2] || "" }
              };
            }
            // If row is an object (header: true)
            const getVal = (keys: string[]) => {
              for (const key of keys) {
                if (row[key] !== undefined) return row[key];
                const foundKey = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
                if (foundKey) return row[foundKey];
              }
              return "";
            };
            return {
              id: `sheet-faq-${idx}`,
              order: idx,
              en: { 
                question: getVal(["Question EN", "Question", "Q EN"]), 
                answer: getVal(["Answer EN", "Answer", "A EN"]) 
              },
              ka: { 
                question: getVal(["Question KA", "Question GEO", "Q KA"]), 
                answer: getVal(["Answer KA", "Answer GEO", "A KA"]) 
              }
            };
          });
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

const getExportUrl = (url: string, sheetType?: "menu" | "faq") => {
  if (!url) return "";
  // If it's already an export URL or pub URL, leave it
  if (url.includes("/export?") || url.includes("/pub?")) return url;
  
  // If it's an edit URL, convert to export
  if (url.includes("/edit")) {
    const match = url.match(/\/d\/(.+?)\/edit/);
    if (match) {
      const id = match[1];
      let gid = "0";
      
      if (sheetType === "menu") {
        gid = "876610475";
      } else if (sheetType === "faq") {
        gid = "642046197";
      } else {
        const gidMatch = url.match(/gid=(\d+)/);
        gid = gidMatch ? gidMatch[1] : "0";
      }
      
      return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
    }
  }
  return url;
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
  isDebug, 
  debugSettings, 
  isMouseMode, 
  mouseTarget,
  transformMode,
  setDebugSettings, 
  scrollProgress,
  setModelTransform
}: { 
  keyframes: CameraKeyframe[], 
  isDebug: boolean,
  debugSettings: Omit<CameraKeyframe, 'percentage'>,
  isMouseMode: boolean,
  mouseTarget: 'camera' | 'object',
  transformMode: 'translate' | 'rotate' | 'scale',
  setDebugSettings: React.Dispatch<React.SetStateAction<Omit<CameraKeyframe, 'percentage'>>>,
  scrollProgress: any,
  setModelTransform: React.Dispatch<React.SetStateAction<{
    position: [number, number, number],
    rotation: [number, number, number],
    scale: number
  }>>
}) {
  const { camera, scene } = useThree();
  
  const debugSettingsRef = useRef(debugSettings);
  useEffect(() => {
    debugSettingsRef.current = debugSettings;
  }, [debugSettings]);

  useFrame(() => {
    if (isDebug) {
      if (!isMouseMode) {
        // Auto-sync to scroll in debug mode when not manually moving
        const progress = scrollProgress.get() * 100;
        const state = interpolateKeyframes(keyframes, progress);
        if (state) {
          camera.position.set(...state.camera.position);
          camera.rotation.set(...state.camera.rotation);
          if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
            (camera as THREE.PerspectiveCamera).fov = state.camera.fov;
            (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
          }
          
          // Also sync the debug state so sliders match
          setDebugSettings(state.camera);
          if (state.model) {
            setModelTransform(state.model);
          }
        }
      } else if (mouseTarget === 'camera') {
        // In mouse mode, camera is controlled by OrbitControls
        // but we still want to update the debug settings state
        setDebugSettings({
          position: [camera.position.x, camera.position.y, camera.position.z],
          rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
          fov: (camera as THREE.PerspectiveCamera).fov
        });
      } else {
        // Mouse mode but targeting object - camera stays at debug settings
        camera.position.set(...debugSettingsRef.current.position);
        camera.rotation.set(...debugSettingsRef.current.rotation);
        if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
          (camera as THREE.PerspectiveCamera).fov = debugSettingsRef.current.fov;
          (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
        }
      }
    } else {
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
    }
  });

  return isDebug && isMouseMode ? (
    <>
      {mouseTarget === 'camera' ? (
        <OrbitControls makeDefault />
      ) : (
        <TransformControls 
          mode={transformMode}
          object={scene.getObjectByName('kama-model-group')}
          onChange={() => {
            if (isDebug && isMouseMode && mouseTarget === 'object') {
              const obj = scene.getObjectByName('kama-model-group');
              if (obj) {
                const rot = [obj.rotation.x, obj.rotation.y, obj.rotation.z] as [number, number, number];
                const pos = [obj.position.x, obj.position.y, obj.position.z] as [number, number, number];
                const scale = obj.scale.x; 
                setModelTransform(prev => ({ 
                  ...prev, 
                  rotation: rot,
                  position: pos,
                  scale: scale
                }));
              }
            }
          }}
        />
      )}
    </>
  ) : null;
}

function SceneDebugModule({ 
  keyframes, 
  setKeyframes, 
  isDebug, 
  setIsDebug, 
  debugSettings, 
  setDebugSettings,
  scrollProgress,
  glbUrl,
  setGlbUrl,
  isMouseMode,
  setIsMouseMode,
  mouseTarget,
  setMouseTarget,
  transformMode,
  setTransformMode,
  envSettings,
  setEnvSettings,
  modelTransform,
  setModelTransform
}: {
  keyframes: CameraKeyframe[],
  setKeyframes: React.Dispatch<React.SetStateAction<CameraKeyframe[]>>,
  isDebug: boolean,
  setIsDebug: React.Dispatch<React.SetStateAction<boolean>>,
  debugSettings: Omit<CameraKeyframe, 'percentage'>,
  setDebugSettings: React.Dispatch<React.SetStateAction<Omit<CameraKeyframe, 'percentage'>>>,
  scrollProgress: any,
  glbUrl: string,
  setGlbUrl: (url: string) => void,
  isMouseMode: boolean,
  setIsMouseMode: (val: boolean) => void,
  mouseTarget: 'camera' | 'object',
  setMouseTarget: (val: 'camera' | 'object') => void,
  transformMode: 'translate' | 'rotate' | 'scale',
  setTransformMode: (val: 'translate' | 'rotate' | 'scale') => void,
  envSettings: EnvironmentSettings,
  setEnvSettings: React.Dispatch<React.SetStateAction<EnvironmentSettings>>,
  modelTransform: {
    position: [number, number, number],
    rotation: [number, number, number],
    scale: number
  },
  setModelTransform: React.Dispatch<React.SetStateAction<{
    position: [number, number, number],
    rotation: [number, number, number],
    scale: number
  }>>
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [urlInput, setUrlInput] = useState(glbUrl);
  const [envUrlInput, setEnvUrlInput] = useState(envSettings.url);
  const currentPercent = Math.round(scrollProgress.get() * 100);

  const addKeyframe = () => {
    const newKeyframe: CameraKeyframe = {
      percentage: currentPercent,
      ...debugSettings,
      modelPosition: modelTransform.position,
      modelRotation: modelTransform.rotation,
      modelScale: modelTransform.scale
    };
    setKeyframes(prev => {
      const filtered = prev.filter(k => k.percentage !== currentPercent);
      return [...filtered, newKeyframe].sort((a, b) => a.percentage - b.percentage);
    });
  };

  const removeKeyframe = (percent: number) => {
    setKeyframes(prev => prev.filter(k => k.percentage !== percent));
  };

  const copyToClipboard = () => {
    const data = {
      model: glbUrl,
      modelTransform: modelTransform,
      environment: envSettings,
      keyframes: keyframes.map(k => ({
        percentage: k.percentage,
        position: k.position,
        rotation: k.rotation,
        fov: k.fov,
        modelPosition: k.modelPosition,
        modelRotation: k.modelRotation,
        modelScale: k.modelScale
      }))
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetToDefaults = () => {
    const cameraDefaults: Omit<CameraKeyframe, 'percentage'> = {
      position: [0, 0, 5],
      rotation: [0, 0, 0],
      fov: 27
    };
    
    const modelDefaults = {
      position: [0, -0.4, 0] as [number, number, number],
      rotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793] as [number, number, number],
      scale: 4.500000000000001
    };

    setDebugSettings(cameraDefaults);
    setModelTransform(modelDefaults);
    
    setKeyframes([
      {
        percentage: 0,
        position: [0, 0, 5],
        rotation: [0, 0, 0],
        fov: 27,
        modelPosition: [0, -0.9, 0],
        modelRotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793],
        modelScale: 4.500000000000001
      },
      {
        percentage: 26,
        position: [0, 0, 5],
        rotation: [0, 0, 0],
        fov: 27,
        modelPosition: [0, -0.6, 0],
        modelRotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793],
        modelScale: 4.500000000000001
      },
      {
        percentage: 73,
        position: [0, 0, 5],
        rotation: [0, 0, 0],
        fov: 27,
        modelPosition: [0, -0.4, 0],
        modelRotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793],
        modelScale: 4.500000000000001
      },
      {
        percentage: 100,
        position: [0, 0, 5],
        rotation: [0, 0, 0],
        fov: 75,
        modelPosition: [0, -0.4, 0],
        modelRotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793],
        modelScale: 4.500000000000001
      }
    ]);
  };

  const syncToScroll = () => {
    const p = scrollProgress.get();
    const percent = p * 100;
    const state = interpolateKeyframes(keyframes, percent);
    
    if (state) {
      setDebugSettings(state.camera);
      if (state.model) {
        setModelTransform(state.model);
      }
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-[100] bg-white/10 backdrop-blur-md border border-white/20 p-3 rounded-full text-white/60 hover:text-white transition-all"
      >
        <Settings size={20} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-80 bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/80">Scene Debug</h3>
        <div className="flex gap-2 items-center">
          {isMouseMode && (
            <div className="flex bg-white/5 rounded-md p-0.5 mr-1 border border-white/10">
              <button 
                onClick={() => setMouseTarget('camera')}
                className={`px-1.5 py-0.5 rounded text-[7px] uppercase font-bold transition-all ${mouseTarget === 'camera' ? 'bg-blue-500 text-white' : 'text-white/40 hover:text-white'}`}
              >
                Cam
              </button>
              <button 
                onClick={() => setMouseTarget('object')}
                className={`px-1.5 py-0.5 rounded text-[7px] uppercase font-bold transition-all ${mouseTarget === 'object' ? 'bg-blue-500 text-white' : 'text-white/40 hover:text-white'}`}
              >
                Obj
              </button>
            </div>
          )}
          {isMouseMode && mouseTarget === 'object' && (
            <div className="flex bg-white/5 rounded-md p-0.5 mr-1 border border-white/10">
              <button 
                onClick={() => setTransformMode('translate')}
                className={`px-1.5 py-0.5 rounded text-[7px] uppercase font-bold transition-all ${transformMode === 'translate' ? 'bg-red-500 text-white' : 'text-white/40 hover:text-white'}`}
              >
                Pos
              </button>
              <button 
                onClick={() => setTransformMode('rotate')}
                className={`px-1.5 py-0.5 rounded text-[7px] uppercase font-bold transition-all ${transformMode === 'rotate' ? 'bg-red-500 text-white' : 'text-white/40 hover:text-white'}`}
              >
                Rot
              </button>
              <button 
                onClick={() => setTransformMode('scale')}
                className={`px-1.5 py-0.5 rounded text-[7px] uppercase font-bold transition-all ${transformMode === 'scale' ? 'bg-red-500 text-white' : 'text-white/40 hover:text-white'}`}
              >
                Scl
              </button>
            </div>
          )}
          <button 
            onClick={() => setIsMouseMode(!isMouseMode)} 
            className={`p-1.5 rounded-md transition-colors ${isMouseMode ? 'bg-blue-500/20 text-blue-400' : 'text-white/40 hover:text-white'}`}
            title="Toggle Mouse Mode"
          >
            <MousePointer2 size={14} />
          </button>
          <button 
            onClick={() => setIsDebug(!isDebug)} 
            className={`p-1.5 rounded-md transition-colors ${isDebug ? 'bg-red-500/20 text-red-400' : 'text-white/40 hover:text-white'}`}
            title="Toggle Debug View"
          >
            {isDebug ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 text-white/40 hover:text-white transition-colors">
            <Minimize2 size={14} />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar">
        {!isDebug && (
          <div className="bg-red-500/20 border border-red-500/30 p-2 rounded-lg mb-2">
            <p className="text-[9px] text-red-400 uppercase font-bold text-center">
              Debug View is OFF. Sliders are disabled.
            </p>
            <button 
              onClick={() => setIsDebug(true)}
              className="w-full mt-1 bg-red-500 text-white text-[8px] py-1 rounded uppercase font-bold hover:bg-red-600 transition-colors"
            >
              Enable Debug View
            </button>
          </div>
        )}

        {/* Model Controls */}
        <div className="space-y-3 pt-2 border-t border-white/5">
          <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Model Transform</p>
          
          <div className="space-y-2">
            <p className="text-[8px] text-white/20 uppercase">Position (X, Y, Z)</p>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map(i => (
                <input 
                  key={i}
                  type="number"
                  step="0.1"
                  value={modelTransform.position[i]}
                  onChange={e => {
                    const newPos = [...modelTransform.position] as [number, number, number];
                    newPos[i] = parseFloat(e.target.value) || 0;
                    setModelTransform(prev => ({ ...prev, position: newPos }));
                  }}
                  className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[9px] text-white font-mono w-full text-right focus:outline-none"
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[8px] text-white/20 uppercase">Rotation (X, Y, Z)</p>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map(i => (
                <input 
                  key={i}
                  type="number"
                  step="0.1"
                  value={modelTransform.rotation[i]}
                  onChange={e => {
                    const newRot = [...modelTransform.rotation] as [number, number, number];
                    newRot[i] = parseFloat(e.target.value) || 0;
                    setModelTransform(prev => ({ ...prev, rotation: newRot }));
                  }}
                  className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[9px] text-white font-mono w-full text-right focus:outline-none"
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-[8px] text-white/20 uppercase">Scale</p>
              <span className="text-[8px] text-white/60 font-mono">{modelTransform.scale.toFixed(1)}</span>
            </div>
            <input 
              type="range"
              min="0.1"
              max="20"
              step="0.1"
              value={modelTransform.scale}
              onChange={e => setModelTransform(prev => ({ ...prev, scale: parseFloat(e.target.value) }))}
              className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
        </div>

        {/* GLB URL Selection */}
        <div className="space-y-2">
          <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Model URL</p>
          <div className="flex gap-2">
            <input 
              type="text"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="Enter GLB URL..."
              className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-white/30"
            />
            <button 
              onClick={() => setGlbUrl(urlInput)}
              className="bg-white/10 hover:bg-white/20 p-1.5 rounded text-white/60 hover:text-white transition-colors"
            >
              <LinkIcon size={14} />
            </button>
          </div>
        </div>

        {/* Environment Settings */}
        <div className="space-y-3 pt-2 border-t border-white/5">
          <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Environment</p>
          
          <div className="space-y-2">
            <p className="text-[8px] text-white/20 uppercase">HDR/EXR URL</p>
            <div className="flex gap-2">
              <input 
                type="text"
                value={envUrlInput}
                onChange={e => setEnvUrlInput(e.target.value)}
                placeholder="Enter HDR URL..."
                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-white/30"
              />
              <button 
                onClick={() => setEnvSettings(prev => ({ ...prev, url: envUrlInput, preset: '' }))}
                className="bg-white/10 hover:bg-white/20 p-1.5 rounded text-white/60 hover:text-white transition-colors"
              >
                <LinkIcon size={14} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <p className="text-[8px] text-white/20 uppercase">Intensity</p>
                <span className="text-[8px] text-white/60 font-mono">{envSettings.intensity.toFixed(1)}</span>
              </div>
              <input 
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={envSettings.intensity}
                onChange={e => setEnvSettings(prev => ({ ...prev, intensity: parseFloat(e.target.value) }))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <p className="text-[8px] text-white/20 uppercase">Blur</p>
                <span className="text-[8px] text-white/60 font-mono">{envSettings.blur.toFixed(1)}</span>
              </div>
              <input 
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={envSettings.blur}
                onChange={e => setEnvSettings(prev => ({ ...prev, blur: parseFloat(e.target.value) }))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[8px] text-white/20 uppercase">Show Background</p>
            <button 
              onClick={() => setEnvSettings(prev => ({ ...prev, background: !prev.background }))}
              className={`w-8 h-4 rounded-full transition-colors relative ${envSettings.background ? 'bg-blue-500' : 'bg-white/10'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${envSettings.background ? 'left-4.5' : 'left-0.5'}`} />
            </button>
          </div>

          <div className="space-y-1">
            <p className="text-[8px] text-white/20 uppercase">Presets</p>
            <div className="flex flex-wrap gap-1">
              {['city', 'apartment', 'lobby', 'night', 'warehouse', 'sunset', 'studio'].map(p => (
                <button 
                  key={p}
                  onClick={() => setEnvSettings(prev => ({ ...prev, preset: p, url: '' }))}
                  className={`px-2 py-1 rounded text-[8px] uppercase tracking-tighter transition-colors ${envSettings.preset === p ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-white/5">
          <div className="flex justify-between text-[9px] uppercase tracking-tighter text-white/40">
            <span>Scroll Position</span>
            <span className="text-white/80 font-mono">{currentPercent}%</span>
          </div>
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 transition-all duration-100" style={{ width: `${currentPercent}%` }} />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Live Controls</p>
          
          {/* Position */}
          <div className="space-y-2">
            <p className="text-[8px] text-white/20 uppercase">Position (X, Y, Z)</p>
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[8px] text-white/40">{i === 0 ? 'X' : i === 1 ? 'Y' : 'Z'}</span>
                    <input 
                      type="number"
                      step="0.1"
                      value={debugSettings.position[i]}
                      onChange={e => {
                        const newPos = [...debugSettings.position] as [number, number, number];
                        newPos[i] = parseFloat(e.target.value) || 0;
                        setDebugSettings(prev => ({ ...prev, position: newPos }));
                      }}
                      className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[9px] text-white font-mono w-12 text-right focus:outline-none"
                    />
                  </div>
                  <input 
                    type="range"
                    min="-20"
                    max="20"
                    step="0.1"
                    value={debugSettings.position[i]}
                    onChange={e => {
                      const newPos = [...debugSettings.position] as [number, number, number];
                      newPos[i] = parseFloat(e.target.value);
                      setDebugSettings(prev => ({ ...prev, position: newPos }));
                    }}
                    disabled={isMouseMode || !isDebug}
                    className={`w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-red-500 ${(isMouseMode || !isDebug) ? 'opacity-30 cursor-not-allowed' : ''}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Rotation */}
          <div className="space-y-2">
            <p className="text-[8px] text-white/20 uppercase">Rotation (X, Y, Z)</p>
            <div className="space-y-3">
              {[0, 1, 2].map(i => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[8px] text-white/40">{i === 0 ? 'X' : i === 1 ? 'Y' : 'Z'}</span>
                    <input 
                      type="number"
                      step="0.1"
                      value={debugSettings.rotation[i]}
                      onChange={e => {
                        const newRot = [...debugSettings.rotation] as [number, number, number];
                        newRot[i] = parseFloat(e.target.value) || 0;
                        setDebugSettings(prev => ({ ...prev, rotation: newRot }));
                      }}
                      className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[9px] text-white font-mono w-12 text-right focus:outline-none"
                    />
                  </div>
                  <input 
                    type="range"
                    min="-6.28"
                    max="6.28"
                    step="0.01"
                    value={debugSettings.rotation[i]}
                    onChange={e => {
                      const newRot = [...debugSettings.rotation] as [number, number, number];
                      newRot[i] = parseFloat(e.target.value);
                      setDebugSettings(prev => ({ ...prev, rotation: newRot }));
                    }}
                    disabled={isMouseMode || !isDebug}
                    className={`w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-red-500 ${(isMouseMode || !isDebug) ? 'opacity-30 cursor-not-allowed' : ''}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* FOV */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-[8px] text-white/20 uppercase">
                FOV ({Math.round(18 / Math.tan((debugSettings.fov * Math.PI / 180) / 2))}mm)
              </p>
              <input 
                type="number"
                value={debugSettings.fov}
                onChange={e => setDebugSettings(prev => ({ ...prev, fov: parseFloat(e.target.value) || 1 }))}
                className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-[9px] text-white font-mono w-12 text-right focus:outline-none"
              />
            </div>
            <input 
              type="range"
              min="1"
              max="120"
              step="1"
              value={debugSettings.fov}
              onChange={e => setDebugSettings(prev => ({ ...prev, fov: parseFloat(e.target.value) }))}
              disabled={isMouseMode || !isDebug}
              className={`w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-red-500 ${(isMouseMode || !isDebug) ? 'opacity-30 cursor-not-allowed' : ''}`}
            />
            <div className="flex flex-wrap gap-1 mt-1">
              {[
                { label: '14mm', fov: 104.3 },
                { label: '16mm', fov: 96.7 },
                { label: '18mm', fov: 90 },
                { label: '20mm', fov: 84 },
                { label: '24mm', fov: 73.7 },
                { label: '28mm', fov: 65.5 },
                { label: '35mm', fov: 54.4 },
                { label: '40mm', fov: 48.5 },
                { label: '50mm', fov: 39.6 },
                { label: '55mm', fov: 36.3 },
                { label: '75mm', fov: 27 },
                { label: '85mm', fov: 23.9 },
                { label: '105mm', fov: 19.5 },
                { label: '135mm', fov: 15.2 },
                { label: '200mm', fov: 10.3 },
                { label: '300mm', fov: 6.9 }
              ].map(lens => (
                <button 
                  key={lens.label}
                  onClick={() => setDebugSettings(prev => ({ ...prev, fov: lens.fov }))}
                  className={`px-1.5 py-0.5 rounded text-[7px] uppercase font-bold transition-all ${Math.abs(debugSettings.fov - lens.fov) < 0.5 ? 'bg-red-500 text-white' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}
                >
                  {lens.label}
                </button>
              ))}
            </div>
          </div>

          <button 
            onClick={addKeyframe}
            className="w-full bg-white text-black py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={14} /> Lock Keyframe at {currentPercent}%
          </button>

          <button 
            onClick={syncToScroll}
            className="w-full bg-blue-500/10 text-blue-400 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2 border border-blue-500/20"
          >
            <RefreshCw size={14} /> Sync to Scroll
          </button>

          <button 
            onClick={resetToDefaults}
            className="w-full bg-red-500/10 text-red-400 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 border border-red-500/20"
          >
            Reset to Defaults
          </button>
        </div>

        <div className="space-y-3 pt-4 border-t border-white/10">
          <div className="flex justify-between items-center">
            <p className="text-[9px] uppercase tracking-widest text-white/40 font-bold">Keyframes ({keyframes.length})</p>
            <button onClick={copyToClipboard} className="text-[8px] text-white/40 hover:text-white flex items-center gap-1 uppercase tracking-widest">
              {copied ? <Check size={10} /> : <Copy size={10} />} {copied ? 'Copied' : 'Copy Code'}
            </button>
          </div>
          
          <div className="space-y-1 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
            {keyframes.map(k => (
              <div key={k.percentage} className="flex flex-col bg-white/5 p-2 rounded-lg group gap-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-red-400 w-8">{k.percentage}%</span>
                    <span className="text-[8px] text-white/40 truncate max-w-[120px]">
                      C:{k.position.map(v => v.toFixed(1)).join(',')}
                    </span>
                  </div>
                  <button onClick={() => removeKeyframe(k.percentage)} className="text-white/20 hover:text-red-500 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
                {k.modelPosition && (
                  <div className="text-[7px] text-blue-400/60 font-mono uppercase tracking-tighter pl-11">
                    M: {k.modelPosition.map(v => v.toFixed(1)).join(',')} | S: {k.modelScale?.toFixed(1)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function KamaModel({ 
  scrollProgress, 
  glbUrl, 
  modelTransform,
  keyframes,
  isDebug
}: { 
  scrollProgress: any, 
  glbUrl: string,
  modelTransform: {
    position: [number, number, number],
    rotation: [number, number, number],
    scale: number
  },
  keyframes: CameraKeyframe[],
  isDebug: boolean
}) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(getRawGithubUrl(glbUrl));
  const { actions, names } = useAnimations(animations, group);
  const { size } = useThree();

  // Viewport optimization: adjust scale based on aspect ratio
  const responsiveScale = useMemo(() => {
    const aspect = size.width / size.height;
    const baseScale = modelTransform.scale;
    if (aspect < 1) { // Portrait (mobile)
      return baseScale * aspect * 1.2;
    }
    return baseScale;
  }, [size, modelTransform.scale]);

  useEffect(() => {
    // Play the first animation if it exists
    if (names.length > 0 && actions[names[0]]) {
      const action = actions[names[0]]!;
      action.play();
      action.paused = true; // We will manually control the time
    }
  }, [actions, names]);

  useFrame(() => {
    // 1. Animation Time Update
    if (names.length > 0 && actions[names[0]]) {
      const action = actions[names[0]]!;
      const duration = action.getClip().duration;
      action.time = scrollProgress.get() * duration;
    }

    // 2. Model Transform Interpolation
    if (group.current) {
      if (isDebug) {
        // In debug mode, use the state values directly
        group.current.position.set(...modelTransform.position);
        group.current.rotation.set(...modelTransform.rotation);
        group.current.scale.setScalar(responsiveScale);
      } else {
        // In scroll mode, interpolate from keyframes using the shared helper
        const progress = scrollProgress.get() * 100;
        const interpolated = interpolateKeyframes(keyframes, progress);
        
        if (interpolated && interpolated.model) {
          group.current.position.set(...interpolated.model.position);
          group.current.rotation.set(...interpolated.model.rotation);
          
          // Apply responsive adjustment to the interpolated scale
          const aspect = size.width / size.height;
          const currentScale = interpolated.model.scale;
          const finalScale = aspect < 1 ? currentScale * aspect * 1.2 : currentScale;
          group.current.scale.setScalar(finalScale);
        }
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
          src={product.image || null}
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
    const q = query(collection(db, "products"), orderBy("created_at", "desc"));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) {
        // Fallback to sheets if DB is empty
        const url = localStorage.getItem("sheet_url") || MENU_CSV_URL;
        const sheetData = await fetchProductsFromSheets(url);
        setMenuData(sheetData);
      } else {
        const products = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Product[];
        setMenuData(products);
      }
      setLoading(false);
    }, async (error) => {
      console.warn("Firestore products unavailable, falling back to sheets:", error);
      const url = localStorage.getItem("sheet_url") || MENU_CSV_URL;
      const sheetData = await fetchProductsFromSheets(url);
      setMenuData(sheetData);
      setLoading(false);
    });

    return () => unsubscribe();
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
    const q = query(collection(db, "faq"), orderBy("created_at", "desc"));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (snapshot.empty) {
        // Fallback to sheets
        const url = localStorage.getItem("sheet_url") || FAQ_CSV_URL;
        const sheetData = await fetchFaqsFromSheets(url);
        setFaqData(sheetData);
      } else {
        const faqs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as FAQItem[];
        setFaqData(faqs);
      }
      setLoading(false);
    }, async (error) => {
      console.warn("Firestore FAQ unavailable, falling back to sheets:", error);
      const url = localStorage.getItem("sheet_url") || FAQ_CSV_URL;
      const sheetData = await fetchFaqsFromSheets(url);
      setFaqData(sheetData);
      setLoading(false);
    });

    return () => unsubscribe();
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [activeTab, setActiveTab] = useState<"products" | "faqs">("products");
  const [isSyncing, setIsSyncing] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(localStorage.getItem("sheet_url") || MENU_CSV_URL);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; type: "product" | "faq" } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  
  // Form states
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    image: "",
    category_en: "",
    category_ka: "",
    en: { name: "", description: [], nutrition: "", category: "" },
    ka: { name: "", description: [], nutrition: "", category: "" }
  });
  const [newFaq, setNewFaq] = useState<Partial<FAQItem>>({
    en: { question: "", answer: "" },
    ka: { question: "", answer: "" }
  });

  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const qProducts = query(collection(db, "products"), orderBy("created_at", "desc"));
      const unsubProducts = onSnapshot(qProducts, (snapshot) => {
        setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[]);
      }, (error) => {
        console.warn("Admin Products listener failed:", error);
      });

      const qFaqs = query(collection(db, "faq"), orderBy("created_at", "desc"));
      const unsubFaqs = onSnapshot(qFaqs, (snapshot) => {
        setFaqs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as FAQItem[]);
      }, (error) => {
        console.warn("Admin FAQ listener failed:", error);
      });

      return () => {
        unsubProducts();
        unsubFaqs();
      };
    }
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Login error:", err);
      setStatusMessage({ text: `Login failed: ${err.message}`, type: "error" });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "products"), {
        ...newProduct,
        created_at: serverTimestamp()
      });
      setShowAddModal(false);
      setNewProduct({
        image: "",
        category_en: "",
        category_ka: "",
        en: { name: "", description: [], nutrition: "", category: "" },
        ka: { name: "", description: [], nutrition: "", category: "" }
      });
      setStatusMessage({ text: "Product added successfully!", type: "success" });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, "products");
    }
  };

  const handleAddFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "faq"), {
        ...newFaq,
        created_at: serverTimestamp()
      });
      setShowAddModal(false);
      setNewFaq({
        en: { question: "", answer: "" },
        ka: { question: "", answer: "" }
      });
      setStatusMessage({ text: "FAQ added successfully!", type: "success" });
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, "faq");
    }
  };

  const syncFromSheets = async () => {
    if (!sheetUrl) {
      alert("Please provide a Google Sheets CSV URL first.");
      return;
    }
    
    localStorage.setItem("sheet_url", sheetUrl);
    setIsSyncing(true);
    try {
      // Fetch from sheets
      const productsData = await fetchProductsFromSheets(sheetUrl);
      const faqsData = await fetchFaqsFromSheets(sheetUrl);

      // Clear existing data first
      const productsSnap = await getDocs(collection(db, "products"));
      for (const docSnap of productsSnap.docs) {
        await deleteDoc(doc(db, "products", docSnap.id));
      }
      
      const faqsSnap = await getDocs(collection(db, "faq"));
      for (const docSnap of faqsSnap.docs) {
        await deleteDoc(doc(db, "faq", docSnap.id));
      }

      // Save to Firestore
      for (const p of productsData) {
        const { id, ...data } = p;
        try {
          await addDoc(collection(db, "products"), {
            ...data,
            created_at: serverTimestamp()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, "products");
        }
      }
      for (const f of faqsData) {
        const { id, ...data } = f;
        try {
          await addDoc(collection(db, "faq"), {
            ...data,
            created_at: serverTimestamp()
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, "faq");
        }
      }

      setStatusMessage({ text: "Data synced and replaced successfully!", type: "success" });
    } catch (error: any) {
      console.error("Import error:", error);
      setStatusMessage({ text: `Import failed: ${error.message || "Unknown error"}`, type: "error" });
    } finally {
      setIsSyncing(false);
    }
  };

  const resetAndSyncFaqs = async () => {
    if (!window.confirm("This will DELETE all current FAQs in the database and replace them with data from the Excel sheet. Are you sure?")) return;
    
    setIsSyncing(true);
    try {
      // 1. Clear Firestore FAQs
      const faqsSnap = await getDocs(collection(db, "faq"));
      for (const docSnap of faqsSnap.docs) {
        await deleteDoc(doc(db, "faq", docSnap.id));
      }

      // 2. Fetch from sheet
      const url = sheetUrl || FAQ_CSV_URL;
      const faqsData = await fetchFaqsFromSheets(url);

      // 3. Save to Firestore
      for (const f of faqsData) {
        const { id, ...data } = f;
        await addDoc(collection(db, "faq"), {
          ...data,
          created_at: serverTimestamp()
        });
      }

      setStatusMessage({ text: "FAQ data reset and synced from Excel successfully!", type: "success" });
    } catch (error: any) {
      console.error("Reset/Sync error:", error);
      setStatusMessage({ text: `Reset/Sync failed: ${error.message}`, type: "error" });
    } finally {
      setIsSyncing(false);
    }
  };

  const deleteProduct = async (id: string) => {
    try {
      await deleteDoc(doc(db, "products", id));
      setConfirmDelete(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `products/${id}`);
    }
  };

  const deleteFaq = async (id: string) => {
    try {
      await deleteDoc(doc(db, "faq", id));
      setConfirmDelete(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `faq/${id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-[#D4FF00] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 p-8 rounded-2xl border border-white/10 w-full max-w-md">
          <h2 className="text-2xl font-big-noodle text-white mb-6 uppercase tracking-widest text-center">ADMIN LOGIN</h2>
          
          <button 
            onClick={handleLogin}
            className="w-full bg-white text-black font-albert font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-zinc-200 transition-colors uppercase tracking-widest"
          >
            <LogIn size={20} />
            Login with Google
          </button>

          {statusMessage && (
            <div className={`mt-6 p-4 rounded-xl text-xs font-bold uppercase tracking-widest text-center ${statusMessage.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
              {statusMessage.text}
            </div>
          )}
          <Link to="/" className="block text-center text-white/40 text-[10px] mt-6 uppercase tracking-widest hover:text-white">BACK TO SITE</Link>
        </div>
      </div>
    );
  }

  const isAdmin = user.email === "verybadagency@gmail.com";

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 p-8 rounded-2xl border border-white/10 w-full max-w-md text-center">
          <h2 className="text-2xl font-big-noodle text-white mb-4 uppercase tracking-widest">ACCESS DENIED</h2>
          <p className="text-white/60 text-sm mb-6 uppercase tracking-widest">You do not have permission to access this dashboard.</p>
          <button 
            onClick={handleLogout}
            className="w-full bg-white text-black font-albert font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-zinc-200 transition-colors uppercase tracking-widest"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-10">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div className="flex items-center gap-6">
            <button onClick={() => navigate("/")} className="text-white/40 hover:text-white transition-colors">
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-3xl md:text-5xl font-big-noodle uppercase tracking-widest flex items-center gap-4">
              CMS DASHBOARD (FIREBASE) v2.0
            </h1>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-[#D4FF00] flex items-center justify-center text-black font-bold">
                {user.email?.[0].toUpperCase()}
              </div>
              <div>
                <p className="text-white text-sm font-bold uppercase tracking-widest">{user.displayName || "Admin"}</p>
                <p className="text-white/40 text-[10px] uppercase tracking-widest">{user.email}</p>
              </div>
            </div>
            
            <button 
              onClick={handleLogout}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg transition-all text-[10px] font-bold uppercase tracking-widest"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12 border-b border-white/10">
          <div className="flex gap-4">
            <button 
              onClick={() => setActiveTab("products")}
              className={`pb-4 px-4 text-xs font-bold tracking-[0.2em] uppercase transition-colors ${activeTab === "products" ? "text-[#D4FF00] border-b-2 border-[#D4FF00]" : "text-white/40 hover:text-white"}`}
            >
              PRODUCTS ({products.length})
            </button>
            <button 
              onClick={() => setActiveTab("faqs")}
              className={`pb-4 px-4 text-xs font-bold tracking-[0.2em] uppercase transition-colors ${activeTab === "faqs" ? "text-[#D4FF00] border-b-2 border-[#D4FF00]" : "text-white/40 hover:text-white"}`}
            >
              FAQ ({faqs.length})
            </button>
          </div>
          <div className="flex gap-4 items-center">
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
                className="text-[#D4FF00] hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2 px-2"
                title="One-time Import from Sheets"
              >
                <span className="text-[8px] font-bold">IMPORT</span>
                <Database size={14} className={isSyncing ? "animate-spin" : ""} />
              </button>
              <button 
                onClick={resetAndSyncFaqs}
                disabled={isSyncing}
                className="text-[#D4FF00] hover:text-white transition-colors disabled:opacity-50 flex items-center gap-2 px-2 border-l border-white/10"
                title="Reset Firestore FAQs and Sync from Excel"
              >
                <span className="text-[8px] font-bold">RESET FAQ</span>
                <RotateCcw size={14} className={isSyncing ? "animate-spin" : ""} />
              </button>
            </div>
            <button 
              onClick={() => setShowAddModal(true)}
              className="bg-[#D4FF00] text-black px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-[#b8dd00] transition-colors mb-4"
            >
              <Plus size={14} />
              ADD {activeTab === "products" ? "PRODUCT" : "FAQ"}
            </button>
          </div>
        </div>

        {/* Add Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-hide">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-big-noodle uppercase tracking-widest">
                  ADD NEW {activeTab === "products" ? "PRODUCT" : "FAQ"}
                </h2>
                <button onClick={() => setShowAddModal(false)} className="text-white/40 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              {activeTab === "products" ? (
                <form onSubmit={handleAddProduct} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <h3 className="text-[10px] text-[#D4FF00] uppercase tracking-widest font-bold">General Info</h3>
                      <input 
                        type="text" 
                        placeholder="IMAGE URL..."
                        className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00]"
                        value={newProduct.image}
                        onChange={e => setNewProduct({...newProduct, image: e.target.value})}
                        required
                      />
                      <input 
                        type="text" 
                        placeholder="CATEGORY (EN)..."
                        className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00]"
                        value={newProduct.category_en}
                        onChange={e => setNewProduct({
                          ...newProduct, 
                          category_en: e.target.value,
                          en: { ...newProduct.en!, category: e.target.value }
                        })}
                        required
                      />
                      <input 
                        type="text" 
                        placeholder="CATEGORY (KA)..."
                        className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00]"
                        value={newProduct.category_ka}
                        onChange={e => setNewProduct({
                          ...newProduct, 
                          category_ka: e.target.value,
                          ka: { ...newProduct.ka!, category: e.target.value }
                        })}
                        required
                      />
                    </div>
                    
                    <div className="space-y-4">
                      <h3 className="text-[10px] text-[#D4FF00] uppercase tracking-widest font-bold">English Details</h3>
                      <input 
                        type="text" 
                        placeholder="PRODUCT NAME (EN)..."
                        className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00]"
                        value={newProduct.en?.name}
                        onChange={e => setNewProduct({...newProduct, en: {...newProduct.en!, name: e.target.value}})}
                        required
                      />
                      <textarea 
                        placeholder="DESCRIPTION (EN) - COMMA SEPARATED..."
                        className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00] h-24"
                        value={newProduct.en?.description.join(", ")}
                        onChange={e => setNewProduct({...newProduct, en: {...newProduct.en!, description: e.target.value.split(",").map(s => s.trim())}})}
                        required
                      />
                      <input 
                        type="text" 
                        placeholder="NUTRITION (EN)..."
                        className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00]"
                        value={newProduct.en?.nutrition}
                        onChange={e => setNewProduct({...newProduct, en: {...newProduct.en!, nutrition: e.target.value}})}
                      />
                    </div>

                    <div className="space-y-4 md:col-span-2">
                      <h3 className="text-[10px] text-[#D4FF00] uppercase tracking-widest font-bold">Georgian Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <input 
                          type="text" 
                          placeholder="PRODUCT NAME (KA)..."
                          className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00]"
                          value={newProduct.ka?.name}
                          onChange={e => setNewProduct({...newProduct, ka: {...newProduct.ka!, name: e.target.value}})}
                          required
                        />
                        <input 
                          type="text" 
                          placeholder="NUTRITION (KA)..."
                          className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00]"
                          value={newProduct.ka?.nutrition}
                          onChange={e => setNewProduct({...newProduct, ka: {...newProduct.ka!, nutrition: e.target.value}})}
                        />
                      </div>
                      <textarea 
                        placeholder="DESCRIPTION (KA) - COMMA SEPARATED..."
                        className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00] h-24"
                        value={newProduct.ka?.description.join(", ")}
                        onChange={e => setNewProduct({...newProduct, ka: {...newProduct.ka!, description: e.target.value.split(",").map(s => s.trim())}})}
                        required
                      />
                    </div>
                  </div>
                  <button type="submit" className="w-full bg-[#D4FF00] text-black font-bold py-4 rounded-xl hover:bg-[#b8dd00] transition-colors uppercase tracking-widest mt-8">
                    SAVE PRODUCT TO NEON
                  </button>
                </form>
              ) : (
                <form onSubmit={handleAddFaq} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-[10px] text-[#D4FF00] uppercase tracking-widest font-bold">English FAQ</h3>
                    <input 
                      type="text" 
                      placeholder="QUESTION (EN)..."
                      className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00]"
                      value={newFaq.en?.question}
                      onChange={e => setNewFaq({...newFaq, en: {...newFaq.en!, question: e.target.value}})}
                      required
                    />
                    <textarea 
                      placeholder="ANSWER (EN)..."
                      className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00] h-32"
                      value={newFaq.en?.answer}
                      onChange={e => setNewFaq({...newFaq, en: {...newFaq.en!, answer: e.target.value}})}
                      required
                    />
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-[10px] text-[#D4FF00] uppercase tracking-widest font-bold">Georgian FAQ</h3>
                    <input 
                      type="text" 
                      placeholder="QUESTION (KA)..."
                      className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00]"
                      value={newFaq.ka?.question}
                      onChange={e => setNewFaq({...newFaq, ka: {...newFaq.ka!, question: e.target.value}})}
                      required
                    />
                    <textarea 
                      placeholder="ANSWER (KA)..."
                      className="w-full bg-black border border-white/10 rounded-lg px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white outline-none focus:border-[#D4FF00] h-32"
                      value={newFaq.ka?.answer}
                      onChange={e => setNewFaq({...newFaq, ka: {...newFaq.ka!, answer: e.target.value}})}
                      required
                    />
                  </div>
                  <button type="submit" className="w-full bg-[#D4FF00] text-black font-bold py-4 rounded-xl hover:bg-[#b8dd00] transition-colors uppercase tracking-widest mt-8">
                    SAVE FAQ TO NEON
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {activeTab === "products" ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map(p => (
                <div key={p.id} className="bg-zinc-900 rounded-2xl border border-white/10 overflow-hidden group relative">
                  <button 
                    onClick={() => setConfirmDelete({ id: p.id, type: "product" })}
                    className="absolute top-2 right-2 z-10 p-2 bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={14} />
                  </button>
                  <div className="aspect-square relative">
                    <img src={p.image || null} className="w-full h-full object-cover" alt={p.en.name} />
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
                <div key={f.id} className="bg-zinc-900 p-6 rounded-2xl border border-white/10 flex justify-between items-center group">
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-widest mb-2">{f.en.question}</h4>
                    <p className="text-[10px] text-white/40 uppercase tracking-widest line-clamp-1">{f.en.answer}</p>
                  </div>
                  <button 
                    onClick={() => setConfirmDelete({ id: f.id, type: "faq" })}
                    className="p-2 text-white/20 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <X size={20} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Status Message Toast */}
        {statusMessage && (
          <div className={`fixed bottom-10 right-10 z-[300] px-6 py-4 rounded-xl border shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-5 ${statusMessage.type === 'success' ? 'bg-green-500/10 border-green-500/50 text-green-500' : 'bg-red-500/10 border-red-500/50 text-red-500'}`}>
            <span className="text-[10px] font-bold uppercase tracking-widest">{statusMessage.text}</span>
            <button onClick={() => setStatusMessage(null)} className="hover:opacity-50">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {confirmDelete && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-white/10 rounded-2xl p-8 w-full max-w-sm text-center">
              <h2 className="text-2xl font-big-noodle uppercase tracking-widest mb-4">CONFIRM DELETE</h2>
              <p className="text-white/40 text-[10px] uppercase tracking-widest mb-8">Are you sure you want to remove this item from the database?</p>
              <div className="flex gap-4">
                <button 
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 bg-white/5 border border-white/10 text-white font-bold py-3 rounded-lg hover:bg-white/10 transition-colors uppercase tracking-widest text-[10px]"
                >
                  CANCEL
                </button>
                <button 
                  onClick={() => confirmDelete.type === 'product' ? deleteProduct(confirmDelete.id) : deleteFaq(confirmDelete.id)}
                  className="flex-1 bg-red-500 text-white font-bold py-3 rounded-lg hover:bg-red-600 transition-colors uppercase tracking-widest text-[10px]"
                >
                  DELETE
                </button>
              </div>
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
      onEnded={() => setIsReversing(true)}
    />
  );
}

function Footer({ lang }: { lang: "en" | "ka" }) {
  return (
    <footer className="relative z-[60] w-full py-20 px-4 md:px-10 bg-black border-t border-white/5">
      <div className="w-full md:w-1/2 mx-auto flex flex-col md:flex-row gap-10 items-stretch">
        {/* Left Block: Video */}
        <div className="flex-1">
          <YoyoVideo 
            src={getRawGithubUrl("https://github.com/KamaBarTbilisi/Kama-Web-assets/blob/2976bf1b268ca8ad100fa5fc0451a064f0b0461b/Footer%2025%20Mart%20Video%20Webm%20v1%20no%20sound.webm")}
            className="w-full h-full object-cover rounded-[120px]"
          />
        </div>

        {/* Right Block: Logo and Info */}
        <div className="flex-1 flex flex-col justify-between gap-10">
          {/* Logo */}
          <div className="flex justify-start">
            <img 
              src="https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/bfd4bbd55b0e1c7924367a6f14ef19cb04b5ff59/Section%201%20-%20Logo.svg"
              alt="Kama Logo"
              className="w-full max-w-[300px] h-auto"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Location and Info */}
          <div className="flex flex-row gap-6 items-end">
            {/* Map */}
            <div className="w-32 h-32 rounded-[20px] overflow-hidden flex-shrink-0 grayscale hover:grayscale-0 transition-all duration-500">
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
            <div className="flex flex-col gap-2 text-[10px] font-albert uppercase tracking-widest text-white/60">
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
      <div className="max-w-[1440px] mx-auto mt-20 pt-8 border-t border-white/5 flex justify-between items-center text-[10px] font-albert uppercase tracking-widest text-white/60">
        <div className="flex gap-6">
          <Link to="/" className="hover:text-white transition-colors">Home</Link>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="hover:text-white transition-colors">About us</button>
          <button onClick={() => document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">Menu</button>
          <button onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">FAQ</button>
        </div>
        <div className="flex gap-6">
          <a href="https://wolt.com/ka/geo/tbilisi/restaurant/kama" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Wolt</a>
          <a href="https://glovoapp.com/en/ge/tbilisi/stores/kama-bar-tbi" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Glovo</a>
          <a href="https://food.bolt.eu/ka-ge/15-tbilisi/p/168387-kama/" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">BoltFood</a>
        </div>
      </div>
      
      <div className="max-w-[1440px] mx-auto mt-8 pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
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

  const [isDebug, setIsDebug] = useState(false);
  const [isMouseMode, setIsMouseMode] = useState(false);
  const [mouseTarget, setMouseTarget] = useState<'camera' | 'object'>('camera');
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('rotate');
  const [modelTransform, setModelTransform] = useState({
    position: [0, -0.4, 0] as [number, number, number],
    rotation: [3.141592653589793, -1.5260604622675666, 3.141592653589793] as [number, number, number],
    scale: 4.500000000000001
  });

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
          position: [2.2957989700052006, 0.5748705461159267, 0.07841442459753657] as [number, number, number],
          rotation: [-1.0361959641394598, 1.505116984519637, 1.0352491953989287] as [number, number, number],
          fov: 75,
          modelPosition: [0, 0, 0],
          modelRotation: [0, 0, 0],
          modelScale: 4.5
        },
        {
          percentage: 100,
          position: [1.8851859497004626, 0.07633277642030038, -0.011864904354123166] as [number, number, number],
          rotation: [-1.7249989186379946, 1.5298421708037517, 1.7251262824716291] as [number, number, number],
          fov: 75,
          modelPosition: [0, 0, 0],
          modelRotation: [0, 0, 0],
          modelScale: 4.5
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

  useEffect(() => {
    const handleResize = () => {
      // Only update if not in debug mode to avoid overwriting manual changes
      if (!isDebug) {
        setKeyframes(getInitialKeyframes());
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isDebug]);
  const [glbUrl, setGlbUrl] = useState("https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/d6853c6b8b3b435d0da5874821170e1f3ccfda70/Kama%20V29.glb");
  const [envSettings, setEnvSettings] = useState<EnvironmentSettings>({
    url: "",
    intensity: 1,
    blur: 0,
    background: false,
    preset: "city"
  });
  const [debugSettings, setDebugSettings] = useState<Omit<CameraKeyframe, 'percentage'>>({
    position: initialKeyframes[0].position,
    rotation: initialKeyframes[0].rotation,
    fov: initialKeyframes[0].fov
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
      <motion.div className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden ${(isDebug && isMouseMode) ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div className="w-full h-full">
          <Canvas 
            gl={{ alpha: true, antialias: true }} 
            dpr={[1, 2]}
            camera={{ position: [0, 0, 5], fov: 75 }}
          >
            <CameraController 
              keyframes={keyframes} 
              isDebug={isDebug}
              debugSettings={debugSettings}
              isMouseMode={isMouseMode}
              mouseTarget={mouseTarget}
              transformMode={transformMode}
              setDebugSettings={setDebugSettings}
              scrollProgress={smoothProgress}
              setModelTransform={setModelTransform}
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
                  modelTransform={modelTransform}
                  keyframes={keyframes}
                  isDebug={isDebug}
                />
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
              src="https://raw.githubusercontent.com/KamaBarTbilisi/Kama-Web-assets/ fresh%201.png"
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

      <SceneDebugModule 
        keyframes={keyframes}
        setKeyframes={setKeyframes}
        isDebug={isDebug}
        setIsDebug={setIsDebug}
        debugSettings={debugSettings}
        setDebugSettings={setDebugSettings}
        scrollProgress={smoothProgress}
        glbUrl={glbUrl}
        setGlbUrl={setGlbUrl}
        isMouseMode={isMouseMode}
        setIsMouseMode={setIsMouseMode}
        mouseTarget={mouseTarget}
        setMouseTarget={setMouseTarget}
        transformMode={transformMode}
        setTransformMode={setTransformMode}
        envSettings={envSettings}
        setEnvSettings={setEnvSettings}
        modelTransform={modelTransform}
        setModelTransform={setModelTransform}
      />

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

  return (
    <ErrorBoundary>
      <div className="noise-overlay" />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainApp lang={lang} setLang={setLang} />} />
          <Route path="/admin" element={<AdminDashboard lang={lang} />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
