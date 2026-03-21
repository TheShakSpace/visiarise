import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { useAppStore, type StudioExtraModel } from '../store/useAppStore';
import {
  applyStudioTransform,
  centerObjectAtOrigin,
  exportObject3DToGlbDataUrl,
  fitCameraToObject,
  loadGltf,
  readStudioTransform,
} from '../lib/studio3d';
import {
  ArrowLeft,
  Box,
  Sun,
  Move,
  RotateCw,
  Maximize,
  Save,
  Download,
  Crosshair,
  Grid,
  Eye,
  Trash2,
  Plus,
  Upload,
  Image as ImageIcon,
  Copy,
  Camera,
  AlignVerticalJustifyStart,
  Palette,
} from 'lucide-react';
import { ArdyaWordmark } from '../components/ArdyaWordmark';

const PRIMARY_ID = 'primary';
const LOGO_ID = 'logo';

export default function Studio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { projects, updateProject } = useAppStore();
  const [projectTitle, setProjectTitle] = useState('');
  const project = projects.find((p) => p.id === id);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const contentRootRef = useRef<THREE.Group | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const directionalLightRef = useRef<THREE.DirectionalLight | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const pendingTransformsRef = useRef<Record<string, ReturnType<typeof readStudioTransform>>>({});

  const glbInputRef = useRef<HTMLInputElement>(null);
  const fuseInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  /** Bumps when Three.js scene is (re)created so effects re-run after Strict Mode remount. */
  const [sceneEpoch, setSceneEpoch] = useState(0);
  const [sceneContentVersion, setSceneContentVersion] = useState(0);
  const loadRequestRef = useRef(0);

  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [activeTool, setActiveTool] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [lighting, setLighting] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [wireframeMode, setWireframeMode] = useState(false);
  const [bgColor, setBgColor] = useState('#030014');
  const [selectedId, setSelectedId] = useState<string>(PRIMARY_ID);
  const logoScaleVal = project?.logoScale ?? 0.65;
  const logoOffsetVal = project?.logoOffsetY ?? 0.4;
  const [logoScaleUi, setLogoScaleUi] = useState(logoScaleVal);
  const [logoOffsetUi, setLogoOffsetUi] = useState(logoOffsetVal);

  useEffect(() => {
    if (project) setProjectTitle(project.name);
  }, [project?.id, project?.name]);

  useEffect(() => {
    setLogoScaleUi(project?.logoScale ?? 0.65);
    setLogoOffsetUi(project?.logoOffsetY ?? 0.4);
  }, [project?.id, project?.logoScale, project?.logoOffsetY]);

  const primarySource = project?.modelDataUrl || project?.modelUrl || '';
  const extrasSerialized = project
    ? JSON.stringify(
        (project.studioExtras || []).map((x) => ({ id: x.id, u: x.modelDataUrl || x.modelUrl || '' }))
      )
    : '';
  const logoSerialized = project
    ? `${project.logoDataUrl || ''}|${logoScaleVal}|${logoOffsetVal}`
    : '';
  const transformsKey = project ? JSON.stringify(project.studioTransforms || {}) : '';

  // Three.js scene (once per mount; epoch signals Strict Mode remount to loaders)
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      50,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(5, 5, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbitControlsRef.current = orbit;

    const transform = new TransformControls(camera, renderer.domElement);
    transform.addEventListener('mouseDown', () => {
      orbit.enabled = false;
    });
    transform.addEventListener('mouseUp', () => {
      orbit.enabled = true;
    });
    scene.add(transform.getHelper());
    transformControlsRef.current = transform;

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    ambientLightRef.current = ambient;
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(5, 5, 5);
    directional.castShadow = true;
    directionalLightRef.current = directional;
    scene.add(directional);

    const contentRoot = new THREE.Group();
    contentRoot.name = 'ContentRoot';
    scene.add(contentRoot);
    contentRootRef.current = contentRoot;

    const gridHelper = new THREE.GridHelper(20, 20, 0x7743db, 0x222222);
    gridHelperRef.current = gridHelper;

    const animate = () => {
      requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    });
    resizeObserver.observe(containerRef.current);

    setSceneEpoch((e) => e + 1);

    return () => {
      resizeObserver.disconnect();
      transformControlsRef.current?.dispose();
      renderer.dispose();
      scene.clear();
      contentRootRef.current = null;
      gridHelperRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      orbitControlsRef.current = null;
      transformControlsRef.current = null;
      ambientLightRef.current = null;
      directionalLightRef.current = null;
    };
  }, []);

  const showStatus = useCallback((msg: string) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(''), 2600);
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const grid = gridHelperRef.current;
    if (!scene || !grid) return;
    if (showGrid) scene.add(grid);
    else scene.remove(grid);
  }, [showGrid, sceneEpoch]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.background = new THREE.Color(bgColor);
  }, [bgColor, sceneEpoch]);

  useEffect(() => {
    const a = ambientLightRef.current;
    const d = directionalLightRef.current;
    if (!a || !d) return;
    a.intensity = 0.35 + lighting * 0.25;
    d.intensity = 0.45 + lighting * 0.55;
  }, [lighting, sceneEpoch]);

  useEffect(() => {
    if (transformControlsRef.current) {
      transformControlsRef.current.setMode(activeTool);
    }
  }, [activeTool]);

  useEffect(() => {
    const tc = transformControlsRef.current;
    if (!tc) return;
    const onChange = () => {
      const o = tc.object;
      if (o && typeof o.userData.studioId === 'string') {
        pendingTransformsRef.current[o.userData.studioId] = readStudioTransform(o);
      }
    };
    tc.addEventListener('objectChange', onChange);
    return () => tc.removeEventListener('objectChange', onChange);
  }, [sceneEpoch]);

  // Build scene meshes from project sources (deps avoid reloading on unrelated project edits)
  useEffect(() => {
    const req = ++loadRequestRef.current;
    if (!sceneRef.current || !contentRootRef.current || !transformControlsRef.current || !id) return;

    const run = async () => {
      const contentRoot = contentRootRef.current;
      const transformControls = transformControlsRef.current;
      const cam = cameraRef.current;
      const orbit = orbitControlsRef.current;
      const p = useAppStore.getState().projects.find((x) => x.id === id);
      if (!contentRoot || !transformControls || !p) return;

      transformControls.detach();
      while (contentRoot.children.length) {
        const c = contentRoot.children[0];
        contentRoot.remove(c);
      }

      const src = p.modelDataUrl || p.modelUrl || '';
      if (!src) {
        if (req === loadRequestRef.current) {
          setLoadError('');
          setSceneContentVersion((v) => v + 1);
        }
        return;
      }

      setLoadError('');
      try {
        const primary = await loadGltf(src);
        primary.userData.studioId = PRIMARY_ID;
        const trP = p.studioTransforms?.[PRIMARY_ID];
        if (trP) applyStudioTransform(primary, trP);
        else centerObjectAtOrigin(primary);
        contentRoot.add(primary);

        let spread = 0;
        for (const ex of p.studioExtras || []) {
          const exSrc = ex.modelDataUrl || ex.modelUrl;
          if (!exSrc) continue;
          const g = await loadGltf(exSrc);
          g.userData.studioId = ex.id;
          const tr = p.studioTransforms?.[ex.id];
          if (tr) applyStudioTransform(g, tr);
          else {
            spread += 1;
            g.position.x = spread * 2.2;
          }
          contentRoot.add(g);
        }

        if (p.logoDataUrl) {
          const tex = await new Promise<THREE.Texture>((resolve, reject) => {
            new THREE.TextureLoader().load(p.logoDataUrl!, resolve, undefined, reject);
          });
          tex.colorSpace = THREE.SRGBColorSpace;
          const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
          });
          const img = tex.image as HTMLImageElement;
          const aspect = img?.width && img?.height ? img.width / img.height : 1;
          const sc = p.logoScale ?? 0.65;
          const geo = new THREE.PlaneGeometry(sc * aspect, sc);
          const mesh = new THREE.Mesh(geo, mat);
          const logoGroup = new THREE.Group();
          logoGroup.userData.studioId = LOGO_ID;
          logoGroup.add(mesh);

          const box = new THREE.Box3().setFromObject(contentRoot);
          const maxY = box.max.y;
          const off = p.logoOffsetY ?? 0.4;
          logoGroup.position.set(0, maxY + off, 0);
          const trL = p.studioTransforms?.[LOGO_ID];
          if (trL) applyStudioTransform(logoGroup, trL);
          contentRoot.add(logoGroup);
        }

        if (cam && orbit && contentRoot.children.length) {
          fitCameraToObject(cam, orbit, contentRoot);
        }

        if (req === loadRequestRef.current) {
          setSceneContentVersion((v) => v + 1);
        }
      } catch (e) {
        console.error(e);
        if (req === loadRequestRef.current) {
          const msg =
            e instanceof Error
              ? e.message
              : 'Could not load this model. Upload a valid GLB/GLTF or pick a fresh asset.';
          setLoadError(msg.length > 180 ? `${msg.slice(0, 180)}…` : msg);
          setSceneContentVersion((v) => v + 1);
        }
      }
    };

    void run();
  }, [id, sceneEpoch, primarySource, extrasSerialized, logoSerialized, transformsKey]);

  useEffect(() => {
    const root = contentRootRef.current;
    if (!root) return;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = mesh.material;
      const mats = Array.isArray(m) ? m : [m];
      mats.forEach((mat) => {
        if (mat && 'wireframe' in mat) {
          (mat as THREE.MeshStandardMaterial).wireframe = wireframeMode;
        }
      });
    });
  }, [wireframeMode, sceneContentVersion, sceneEpoch]);

  useEffect(() => {
    const tc = transformControlsRef.current;
    const root = contentRootRef.current;
    if (!tc || !root) return;
    let target: THREE.Object3D | null = null;
    root.traverse((o) => {
      if (o.userData.studioId === selectedId) target = o;
    });
    if (target) tc.attach(target);
    else tc.detach();
  }, [selectedId, sceneContentVersion, sceneEpoch]);

  const handleSave = () => {
    if (!id || !project) return;
    setIsSaving(true);
    const name = projectTitle.trim() || project.name;
    const transforms = { ...project.studioTransforms, ...pendingTransformsRef.current };
    updateProject(id, { name, studioTransforms: transforms });
    window.setTimeout(() => setIsSaving(false), 500);
    showStatus('Project saved');
  };

  const handlePublishAr = async () => {
    if (!id || !contentRootRef.current) return;
    const root = contentRootRef.current;
    if (root.children.length === 0) {
      showStatus('Add a model before publishing');
      return;
    }
    setIsPublishing(true);
    try {
      const dataUrl = await exportObject3DToGlbDataUrl(root);
      updateProject(id, { modelDataUrl: dataUrl, modelUrl: undefined });
      showStatus('Scene exported · opening AR');
      navigate(`/ar/${id}`);
    } catch (e) {
      console.error(e);
      showStatus('Export failed — try simplifying the scene');
    } finally {
      setIsPublishing(false);
    }
  };

  const copyShareLink = async () => {
    if (!id) return;
    const url = `${window.location.origin}/ar/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      showStatus('Share link copied');
    } catch {
      showStatus('Copy blocked — copy URL manually');
    }
  };

  const downloadMergedGlb = async () => {
    const root = contentRootRef.current;
    if (!root || root.children.length === 0) {
      showStatus('Nothing to export');
      return;
    }
    try {
      const dataUrl = await exportObject3DToGlbDataUrl(root);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${(projectTitle || project?.name || 'scene').replace(/\s+/g, '-')}.glb`;
      a.click();
      showStatus('GLB downloaded');
    } catch (e) {
      console.error(e);
      showStatus('Download failed');
    }
  };

  const captureScreenshot = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(projectTitle || project?.name || 'viewport').replace(/\s+/g, '-')}.png`;
    a.click();
    showStatus('Screenshot saved');
  };

  const snapAllToGround = () => {
    const root = contentRootRef.current;
    if (!root) return;
    root.children.forEach((child) => {
      if (child.userData.studioId === LOGO_ID) return;
      const box = new THREE.Box3().setFromObject(child);
      child.position.y += -box.min.y;
    });
    root.traverse((o) => {
      if (typeof o.userData.studioId === 'string') {
        pendingTransformsRef.current[o.userData.studioId] = readStudioTransform(o);
      }
    });
    showStatus('Models snapped to ground');
  };

  const onPrimaryGlb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !id) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateProject(id, { modelDataUrl: reader.result as string, modelUrl: undefined });
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const onFuseGlb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !id) return;
    const reader = new FileReader();
    reader.onload = () => {
      const cur = useAppStore.getState().projects.find((x) => x.id === id);
      const next: StudioExtraModel = {
        id: `layer-${Date.now()}`,
        name: f.name.replace(/\.[^/.]+$/, '') || 'Fused layer',
        modelDataUrl: reader.result as string,
      };
      updateProject(id, { studioExtras: [...(cur?.studioExtras || []), next] });
      showStatus('Model fused into scene');
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const onLogoImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !id) return;
    const reader = new FileReader();
    reader.onload = () => updateProject(id, { logoDataUrl: reader.result as string });
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const removeExtra = (extraId: string) => {
    if (!id) return;
    const cur = useAppStore.getState().projects.find((x) => x.id === id);
    if (!cur?.studioExtras) return;
    updateProject(id, { studioExtras: cur.studioExtras.filter((x) => x.id !== extraId) });
    if (selectedId === extraId) setSelectedId(PRIMARY_ID);
  };

  const clearLogo = () => {
    if (!id) return;
    updateProject(id, { logoDataUrl: undefined });
    if (selectedId === LOGO_ID) setSelectedId(PRIMARY_ID);
  };

  const resetCamera = () => {
    const root = contentRootRef.current;
    const cam = cameraRef.current;
    const orbit = orbitControlsRef.current;
    if (root && cam && orbit && root.children.length) fitCameraToObject(cam, orbit, root);
  };

  if (!project) return <div className="p-10 text-white">Project not found.</div>;

  const hierarchyEntries: { id: string; label: string; kind: 'primary' | 'extra' | 'logo' }[] = [
    ...(primarySource ? [{ id: PRIMARY_ID, label: 'Main model', kind: 'primary' as const }] : []),
    ...(project.studioExtras || []).map((ex) => ({
      id: ex.id,
      label: ex.name,
      kind: 'extra' as const,
    })),
    ...(project.logoDataUrl ? [{ id: LOGO_ID, label: 'Logo / image', kind: 'logo' as const }] : []),
  ];

  return (
    <div className="h-screen flex flex-col bg-[#050505] overflow-hidden">
      <header className="min-h-14 sm:h-16 flex flex-col sm:flex-row sm:items-center justify-center sm:justify-between gap-2 px-3 sm:px-6 py-2 sm:py-0 border-b border-white/5 bg-black/40 backdrop-blur-md z-20">
        <div className="flex items-center gap-3 min-w-0">
          <Link to={`/project/${id}`} className="p-2 hover:bg-white/5 rounded-full transition-colors shrink-0">
            <ArrowLeft className="w-5 h-5 text-white/40" />
          </Link>
          <div className="flex items-center gap-3 min-w-0">
            <ArdyaWordmark className="text-sm shrink-0 hidden sm:block" />
            <div className="min-w-0">
              <input
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                onBlur={() => {
                  const t = projectTitle.trim();
                  if (t && id) updateProject(id, { name: t });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                placeholder="Name your project"
                className="w-full max-w-[140px] sm:max-w-xs bg-transparent border-none outline-none text-sm font-bold tracking-tight text-white truncate placeholder:text-white/30"
                aria-label="Project name"
              />
              <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">AR Studio</p>
            </div>
          </div>
        </div>

        {(statusMsg || loadError) && (
          <div
            className={`hidden md:block text-[10px] font-bold uppercase tracking-wider max-w-[220px] truncate ${
              loadError ? 'text-red-400' : 'text-brand-primary'
            }`}
          >
            {loadError || statusMsg}
          </div>
        )}

        <div className="flex items-center gap-1 sm:gap-2 shrink-0 flex-nowrap sm:flex-wrap justify-start sm:justify-end overflow-x-auto max-w-[100vw] pb-0.5 sm:pb-0 [-webkit-overflow-scrolling:touch]">
          <input
            ref={glbInputRef}
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            className="hidden"
            onChange={onPrimaryGlb}
          />
          <input ref={fuseInputRef} type="file" accept=".glb,.gltf" className="hidden" onChange={onFuseGlb} />
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={onLogoImage}
          />

          <button
            type="button"
            onClick={() => glbInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-white/15 text-[10px] sm:text-xs font-bold text-white/80 hover:bg-white/5"
            title="Replace main GLB"
          >
            <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">GLB</span>
          </button>
          <button
            type="button"
            onClick={() => fuseInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-white/15 text-[10px] sm:text-xs font-bold text-white/80 hover:bg-white/5"
            title="Fuse another GLB into this scene"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Fuse</span>
          </button>
          <button
            type="button"
            onClick={() => logoInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-white/15 text-[10px] sm:text-xs font-bold text-white/80 hover:bg-white/5"
            title="Add logo image above the model"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Logo</span>
          </button>

          <button
            type="button"
            onClick={copyShareLink}
            className="p-2 text-white/50 hover:text-white transition-colors"
            title="Copy AR share link"
          >
            <Copy className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            type="button"
            onClick={downloadMergedGlb}
            className="p-2 text-white/50 hover:text-white transition-colors"
            title="Download merged GLB"
          >
            <Download className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            type="button"
            onClick={captureScreenshot}
            className="p-2 text-white/50 hover:text-white transition-colors"
            title="Screenshot viewport PNG"
          >
            <Camera className="w-5 h-5" />
          </button>

          <div className="w-px h-6 bg-white/5 mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 sm:px-6 py-2 bg-brand-primary text-black rounded-full text-[10px] sm:text-xs font-bold hover:bg-brand-primary/90 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            <span className="hidden sm:inline">{isSaving ? 'Saving…' : 'Save'}</span>
          </button>
          <button
            type="button"
            onClick={handlePublishAr}
            disabled={isPublishing}
            className="px-4 sm:px-6 py-2 bg-white text-black rounded-full text-[10px] sm:text-xs font-bold hover:bg-white/90 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Maximize className="w-3 h-3" />
            <span className="hidden sm:inline">{isPublishing ? 'Export…' : 'Publish AR'}</span>
          </button>
        </div>
      </header>

      {(loadError || statusMsg) && (
        <div className="md:hidden px-4 py-2 text-[10px] font-bold uppercase border-b border-white/5 text-center bg-black/30">
          <span className={loadError ? 'text-red-400' : 'text-brand-primary'}>{loadError || statusMsg}</span>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Mobile: primary tools as horizontal strip */}
        <aside className="md:hidden flex flex-row items-center gap-1 overflow-x-auto shrink-0 border-b border-white/5 bg-black/50 px-2 py-2 z-10 [-webkit-overflow-scrolling:touch]">
          {(
            [
              { id: 'translate' as const, icon: Move, label: 'Move' },
              { id: 'rotate' as const, icon: RotateCw, label: 'Rotate' },
              { id: 'scale' as const, icon: Maximize, label: 'Scale' },
            ] as const
          ).map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => setActiveTool(tool.id)}
              className={`p-2.5 rounded-lg shrink-0 ${
                activeTool === tool.id
                  ? 'bg-brand-primary text-black'
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
              aria-label={tool.label}
            >
              <tool.icon className="w-4 h-4" />
            </button>
          ))}
          <div className="w-px h-8 bg-white/10 mx-0.5 shrink-0" />
          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            className={`p-2.5 rounded-lg shrink-0 ${showGrid ? 'text-brand-primary' : 'text-white/40'}`}
            aria-label="Toggle grid"
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setWireframeMode(!wireframeMode)}
            className={`p-2.5 rounded-lg shrink-0 ${wireframeMode ? 'text-brand-primary' : 'text-white/40'}`}
            aria-label="Wireframe"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={snapAllToGround}
            className="p-2.5 rounded-lg shrink-0 text-white/40"
            aria-label="Snap to ground"
          >
            <AlignVerticalJustifyStart className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={resetCamera}
            className="p-2.5 rounded-lg shrink-0 text-white/40"
            aria-label="Reset camera"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        </aside>

        <aside className="hidden md:flex w-14 sm:w-16 border-r border-white/5 bg-black/40 flex-col items-center py-4 sm:py-6 gap-3 z-10 shrink-0">
          {(
            [
              { id: 'translate' as const, icon: Move, label: 'Move' },
              { id: 'rotate' as const, icon: RotateCw, label: 'Rotate' },
              { id: 'scale' as const, icon: Maximize, label: 'Scale' },
            ] as const
          ).map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => setActiveTool(tool.id)}
              className={`p-2.5 sm:p-3 rounded-xl transition-all group relative ${
                activeTool === tool.id
                  ? 'bg-brand-primary text-black'
                  : 'text-white/20 hover:text-white hover:bg-white/5'
              }`}
            >
              <tool.icon className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="absolute left-14 px-2 py-1 rounded bg-black border border-white/10 text-[10px] font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                {tool.label}
              </span>
            </button>
          ))}
          <div className="w-8 h-px bg-white/5 my-1" />
          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            className={`p-2.5 sm:p-3 rounded-xl transition-all group relative ${
              showGrid ? 'text-brand-primary' : 'text-white/20 hover:text-white hover:bg-white/5'
            }`}
            title="Toggle grid"
          >
            <Grid className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            type="button"
            onClick={() => setWireframeMode(!wireframeMode)}
            className={`p-2.5 sm:p-3 rounded-xl transition-all group relative ${
              wireframeMode ? 'text-brand-primary' : 'text-white/20 hover:text-white hover:bg-white/5'
            }`}
            title="Wireframe mode"
          >
            <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            type="button"
            onClick={snapAllToGround}
            className="p-2.5 sm:p-3 rounded-xl text-white/20 hover:text-white hover:bg-white/5 transition-all group relative"
            title="Snap models to ground"
          >
            <AlignVerticalJustifyStart className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            type="button"
            onClick={resetCamera}
            className="p-2.5 sm:p-3 rounded-xl text-white/20 hover:text-white hover:bg-white/5 transition-all group relative"
            title="Reset camera"
          >
            <Crosshair className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </aside>

        <main
          ref={containerRef}
          className="flex-1 relative bg-[#0a0a0a] min-w-0 min-h-[min(55vh,420px)] md:min-h-0"
        >
          <canvas ref={canvasRef} className="w-full h-full block" />

          <div className="absolute top-4 sm:top-6 left-4 sm:left-6 flex flex-wrap items-center gap-3">
            <div className="px-3 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/60">Live</span>
            </div>
            <label className="flex items-center gap-2 px-3 py-2 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white/50 uppercase tracking-wider cursor-pointer">
              <Palette className="w-3.5 h-3.5" />
              <input
                type="color"
                value={bgColor}
                onChange={(e) => setBgColor(e.target.value)}
                className="w-7 h-5 rounded border-0 p-0 bg-transparent cursor-pointer"
                title="Viewport background"
              />
            </label>
          </div>

          <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 px-4 sm:px-6 py-3 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 flex flex-wrap items-center justify-center gap-6 max-w-[95vw]">
            <div className="flex items-center gap-3">
              <Sun className="w-4 h-4 text-white/40 shrink-0" />
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={lighting}
                onChange={(e) => setLighting(parseFloat(e.target.value))}
                className="w-24 sm:w-32 accent-brand-primary h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
                aria-label="Lighting"
              />
            </div>
          </div>
        </main>

        <aside className="w-full md:w-80 max-h-[min(42vh,320px)] md:max-h-none md:self-stretch border-t md:border-t-0 md:border-l border-white/5 bg-black/40 flex flex-col z-10 shrink-0 md:overflow-hidden">
          <div className="p-4 sm:p-6 flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-8">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">Scene hierarchy</h2>
              <div className="space-y-2">
                {hierarchyEntries.length === 0 && (
                  <p className="text-xs text-white/35 py-6 text-center">Upload a GLB to start.</p>
                )}
                {hierarchyEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                      selectedId === entry.id
                        ? 'bg-brand-primary/10 border-brand-primary/30'
                        : 'bg-white/5 border-white/5 hover:border-white/10'
                    }`}
                    onClick={() => setSelectedId(entry.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedId(entry.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Box className="w-4 h-4 text-brand-primary shrink-0" />
                      <span className="text-sm font-medium text-white/85 truncate">{entry.label}</span>
                    </div>
                    {entry.kind === 'extra' && (
                      <button
                        type="button"
                        className="text-white/30 hover:text-red-400 p-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeExtra(entry.id);
                        }}
                        aria-label="Remove layer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {entry.kind === 'logo' && (
                      <button
                        type="button"
                        className="text-white/30 hover:text-red-400 p-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearLogo();
                        }}
                        aria-label="Remove logo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => fuseInputRef.current?.click()}
                className="w-full mt-3 py-3 rounded-xl border border-dashed border-white/15 text-white/40 hover:text-white hover:border-white/25 transition-all flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest"
              >
                <Plus className="w-4 h-4" />
                Fuse model
              </button>
            </div>

            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">Logo layout</h2>
              <p className="text-[10px] text-white/35 mb-3">Adjust size & height; release slider to apply.</p>
              <div className="space-y-3">
                <div>
                  <span className="text-[9px] font-bold text-white/30 uppercase">Scale</span>
                  <input
                    type="range"
                    min={0.15}
                    max={2.5}
                    step={0.05}
                    value={logoScaleUi}
                    onChange={(e) => setLogoScaleUi(parseFloat(e.target.value))}
                    onMouseUp={(e) =>
                      id && updateProject(id, { logoScale: parseFloat((e.currentTarget as HTMLInputElement).value) })
                    }
                    onTouchEnd={(e) =>
                      id && updateProject(id, { logoScale: parseFloat((e.currentTarget as HTMLInputElement).value) })
                    }
                    className="w-full accent-brand-primary h-1 bg-white/10 rounded-full mt-1"
                    disabled={!project.logoDataUrl}
                  />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-white/30 uppercase">Height offset</span>
                  <input
                    type="range"
                    min={-1}
                    max={3}
                    step={0.05}
                    value={logoOffsetUi}
                    onChange={(e) => setLogoOffsetUi(parseFloat(e.target.value))}
                    onMouseUp={(e) =>
                      id &&
                      updateProject(id, { logoOffsetY: parseFloat((e.currentTarget as HTMLInputElement).value) })
                    }
                    onTouchEnd={(e) =>
                      id &&
                      updateProject(id, { logoOffsetY: parseFloat((e.currentTarget as HTMLInputElement).value) })
                    }
                    className="w-full accent-brand-primary h-1 bg-white/10 rounded-full mt-1"
                    disabled={!project.logoDataUrl}
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3">Selection</h2>
              <button
                type="button"
                onClick={() => {
                  const sid = selectedId;
                  if (!id || !sid) return;
                  if (sid === PRIMARY_ID) {
                    updateProject(id, { modelDataUrl: undefined, modelUrl: undefined });
                    setSelectedId(PRIMARY_ID);
                  } else if (sid !== LOGO_ID) removeExtra(sid);
                }}
                disabled={
                  !selectedId ||
                  selectedId === LOGO_ID ||
                  (selectedId === PRIMARY_ID && !primarySource)
                }
                className="w-full py-3 bg-red-500/10 text-red-400 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-red-500/15 transition-all flex items-center justify-center gap-2 disabled:opacity-30 disabled:pointer-events-none"
              >
                <Trash2 className="w-4 h-4" />
                Remove selected
              </button>
              <p className="text-[9px] text-white/25 mt-2">
                Removes main or fused GLB from the project. Logo has its own trash in hierarchy.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
