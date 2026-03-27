import { useEffect, useRef, useState } from 'react';
import {
  useAppStore,
  apiChatToMessage,
  type ChatMessage,
  type StudioExtraModel,
} from '../../store/useAppStore';
import { apiFetch, type ChatListResponse, type MeshyGenerateResponse } from '../../lib/api';
import { isMongoObjectId } from '../../lib/mongoId';
import { compactModelUrls } from '../../lib/meshyModel';
import { pollMeshyTask, waitForLinkedRefineTask } from '../../lib/meshyPoll';
import { Send, Loader2, ImagePlus, Box, Sparkles, Users, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

type Props = {
  projectId: string;
  compact?: boolean;
  themeMuted: string;
  themeInk: string;
  uiTheme: 'dark' | 'light';
  onModelReady?: () => void;
};

export function StudioAiChat({ projectId, compact, themeMuted, themeInk, uiTheme, onModelReady }: Props) {
  const {
    projects,
    user,
    chatHistory,
    addChatMessage,
    updateProject,
    replaceChatHistory,
    setCredits,
    refreshUser,
  } = useAppStore();
  const project = projects.find((p) => p.id === projectId);
  const messages = chatHistory[projectId] || [];

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [meshyProgress, setMeshyProgress] = useState(0);
  const [stagedImage, setStagedImage] = useState<string | null>(null);
  const [meshyMeshMode, setMeshyMeshMode] = useState<'geometry' | 'full' | 'texture_only'>('full');
  const [poly, setPoly] = useState<'low' | 'medium' | 'high'>('medium');
  const endRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!projectId || !user?.token || !isMongoObjectId(projectId)) return;
    let cancelled = false;
    (async () => {
      try {
        const { messages: raw } = await apiFetch<ChatListResponse>(`/api/projects/${projectId}/chat`, {
          token: user.token,
        });
        if (!cancelled) replaceChatHistory(projectId, raw.map(apiChatToMessage));
      } catch {
        /* offline / demo */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, user?.token, replaceChatHistory]);

  const handleSendText = async () => {
    const text = input.trim();
    if (!text || isGenerating || !projectId) return;
    if (!user?.token) {
      addChatMessage(projectId, {
        id: `m-${Date.now()}`,
        role: 'assistant',
        content: 'Sign in with a verified account to generate 3D with Meshy AI.',
      });
      return;
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: `[Meshy · ${meshyMeshMode} · ${poly}] ${text}`,
    };
    addChatMessage(projectId, userMsg);
    setInput('');
    setIsGenerating(true);
    setMeshyProgress(0);

    try {
      if (meshyMeshMode === 'texture_only' && !project?.meshyPreviewTaskId) {
        throw new Error('Generate a model preview first, then use Texture mode.');
      }

      let previewId = project?.meshyPreviewTaskId || '';
      let finalTask: import('../../lib/api').MeshyTaskPayload;

      if (meshyMeshMode === 'texture_only') {
        const refineOnly = await apiFetch<MeshyGenerateResponse>(
          `/api/meshy/refine/${encodeURIComponent(project!.meshyPreviewTaskId!)}`,
          {
            method: 'POST',
            token: user.token,
            body: JSON.stringify({ texture_prompt: text, enable_pbr: true }),
          }
        );
        if (typeof refineOnly.creditsRemaining === 'number') setCredits(refineOnly.creditsRemaining);
        finalTask = await pollMeshyTask(refineOnly.task.taskId, user.token, {
          onProgress: setMeshyProgress,
        });
      } else {
        const previewRes = await apiFetch<MeshyGenerateResponse>('/api/meshy/generate', {
          method: 'POST',
          token: user.token,
          body: JSON.stringify({
            prompt: text,
            poly_budget: poly,
            ...(meshyMeshMode === 'full'
              ? { auto_refine: true, texture_prompt: text, enable_pbr: true }
              : {}),
          }),
        });
        if (typeof previewRes.creditsRemaining === 'number') setCredits(previewRes.creditsRemaining);
        const previewTask = await pollMeshyTask(previewRes.task.taskId, user.token, {
          onProgress: setMeshyProgress,
        });
        previewId = previewRes.task.taskId;
        if (meshyMeshMode === 'full') {
          const refineId = await waitForLinkedRefineTask(previewRes.task.taskId, user.token);
          finalTask = await pollMeshyTask(refineId, user.token, { onProgress: setMeshyProgress });
        } else {
          finalTask = previewTask;
        }
      }

      const finalGlb = finalTask.modelUrls?.glb;
      if (!finalGlb) throw new Error('No GLB URL returned yet.');
      void refreshUser();
      const urls = compactModelUrls(finalTask.modelUrls);
      addChatMessage(projectId, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: 'Model ready — use “Set as main” or “Fuse as layer” below.',
        modelUrl: finalGlb,
        modelUrls: urls,
        meshyTaskId: finalTask.taskId,
      });
      updateProject(projectId, {
        modelUrl: finalGlb,
        modelDataUrl: undefined,
        thumbnailUrl: finalTask.thumbnailUrl || project?.thumbnailUrl,
        meshyPreviewTaskId: previewId || project?.meshyPreviewTaskId,
        meshyTaskId: finalTask.taskId,
        modelUrls: urls,
        status: 'draft',
      });
      onModelReady?.();
    } catch (e) {
      addChatMessage(projectId, {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: `Error: ${(e as Error).message || 'Generation failed'}`,
      });
    } finally {
      setIsGenerating(false);
      setMeshyProgress(0);
    }
  };

  const handleImageTo3D = async () => {
    if (!stagedImage || !user?.token || !projectId) return;
    if (meshyMeshMode === 'texture_only') {
      addChatMessage(projectId, {
        id: `t-${Date.now()}`,
        role: 'assistant',
        content: 'Texture-only needs an existing Meshy preview. Use Model or Textured first.',
      });
      return;
    }
    setIsGenerating(true);
    setMeshyProgress(0);
    try {
      const res = await apiFetch<MeshyGenerateResponse>('/api/meshy/generate-from-image', {
        method: 'POST',
        token: user.token,
        body: JSON.stringify({
          image_data_url: stagedImage,
          poly_budget: poly,
          should_texture: meshyMeshMode !== 'geometry',
          enable_pbr: meshyMeshMode !== 'geometry',
        }),
      });
      if (typeof res.creditsRemaining === 'number') setCredits(res.creditsRemaining);
      addChatMessage(projectId, {
        id: `ui-${Date.now()}`,
        role: 'user',
        content: `[Meshy · image → 3D · ${poly} · ${meshyMeshMode}]`,
      });
      const finalTask = await pollMeshyTask(res.task.taskId, user.token, { onProgress: setMeshyProgress });
      const finalGlb = finalTask.modelUrls?.glb;
      if (!finalGlb) throw new Error('No GLB URL returned.');
      void refreshUser();
      const urls = compactModelUrls(finalTask.modelUrls);
      addChatMessage(projectId, {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: '3D from image is ready.',
        modelUrl: finalGlb,
        modelUrls: urls,
        meshyTaskId: finalTask.taskId,
      });
      updateProject(projectId, {
        modelUrl: finalGlb,
        modelDataUrl: undefined,
        thumbnailUrl: finalTask.thumbnailUrl || project?.thumbnailUrl,
        meshyPreviewTaskId: res.task.taskId,
        meshyTaskId: finalTask.taskId,
        modelUrls: urls,
        status: 'draft',
      });
      setStagedImage(null);
      onModelReady?.();
    } catch (e) {
      addChatMessage(projectId, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `Image→3D error: ${(e as Error).message}`,
      });
    } finally {
      setIsGenerating(false);
      setMeshyProgress(0);
    }
  };

  const fuseAsLayer = (url: string) => {
    if (!projectId) return;
    const cur = useAppStore.getState().projects.find((p) => p.id === projectId);
    const next: StudioExtraModel = {
      id: `layer-${Date.now()}`,
      name: 'AI layer',
      modelUrl: url,
    };
    updateProject(projectId, { studioExtras: [...(cur?.studioExtras || []), next] });
    onModelReady?.();
  };

  const border = uiTheme === 'light' ? 'border-zinc-200' : 'border-white/10';
  const bubbleUser = uiTheme === 'light' ? 'bg-zinc-200 text-zinc-900' : 'bg-white/10 text-white/90';
  const bubbleAi = uiTheme === 'light' ? 'bg-white border border-zinc-200 text-zinc-800' : 'bg-white/5 text-white/85';
  const panelBg = uiTheme === 'light' ? 'bg-zinc-50/80' : 'bg-black/35';

  return (
    <div className={`flex flex-col h-full min-h-0 ${compact ? 'max-h-[70vh]' : ''}`}>
      <div
        className={`rounded-xl border ${border} ${panelBg} backdrop-blur-md p-3 mb-2 space-y-2 ${
          compact ? 'text-[10px]' : 'text-[11px]'
        }`}
      >
        <div className="flex items-start gap-2">
          <div className="p-1.5 rounded-lg bg-brand-primary/15 text-brand-primary shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className={`font-bold uppercase tracking-widest ${themeMuted} mb-0.5`}>Ardya · Meshy 3D</p>
            <p className={themeInk}>
              Text &amp; image → GLB. Need a human touch? Hire a spatial designer — same pipeline, pro polish.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/freelancers"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-primary text-black text-[10px] font-bold uppercase tracking-wider hover:bg-brand-primary/90"
          >
            <Users className="w-3.5 h-3.5" />
            Hire a 3D designer
          </Link>
          <a
            href="mailto:hello@visiarise.com?subject=Studio%20%2F%20LLM%20—%20design%20help"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border ${border} text-[10px] font-bold uppercase tracking-wider ${themeInk}`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Book scope &amp; payment
          </a>
        </div>
      </div>

      <div className={`flex-1 min-h-0 overflow-y-auto space-y-2.5 p-3 ${border} rounded-xl ${panelBg}`}>
        {messages.length === 0 && (
          <p className={`text-[12px] leading-relaxed ${themeMuted}`}>
            Describe a model in text, or attach an image for image→3D. Generation uses your account credits; results sync
            to this project automatically.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl px-3 py-2 text-[12px] max-w-[95%] shadow-sm ${m.role === 'user' ? `${bubbleUser} ml-auto` : bubbleAi}`}
          >
            <p className="whitespace-pre-wrap break-words">{m.content}</p>
            {m.modelUrl && m.role === 'assistant' ? (
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  className="px-2 py-1 rounded bg-brand-primary text-black text-[10px] font-bold"
                  onClick={() => {
                    updateProject(projectId, { modelUrl: m.modelUrl, modelDataUrl: undefined });
                    onModelReady?.();
                  }}
                >
                  Set as main
                </button>
                <button
                  type="button"
                  className="px-2 py-1 rounded border border-white/20 text-[10px] font-bold"
                  onClick={() => fuseAsLayer(m.modelUrl!)}
                >
                  Fuse as layer
                </button>
              </div>
            ) : null}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className={`mt-2 space-y-3 p-3 rounded-xl border ${border} ${panelBg} backdrop-blur-md`}>
        <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide">
          <select
            value={meshyMeshMode}
            onChange={(e) => setMeshyMeshMode(e.target.value as typeof meshyMeshMode)}
            className={`rounded-lg border ${border} bg-transparent px-2 py-1.5 text-[11px] min-w-[7rem] ${themeInk}`}
          >
            <option value="full">Textured</option>
            <option value="geometry">Geometry</option>
            <option value="texture_only">Texture only</option>
          </select>
          <select
            value={poly}
            onChange={(e) => setPoly(e.target.value as typeof poly)}
            className={`rounded-lg border ${border} bg-transparent px-2 py-1.5 text-[11px] ${themeInk}`}
          >
            <option value="low">Low poly</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        {stagedImage ? (
          <div className="flex items-center gap-2">
            <img src={stagedImage} alt="" className="h-12 w-12 rounded object-cover border border-white/15" />
            <button
              type="button"
              onClick={handleImageTo3D}
              disabled={isGenerating}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-brand-primary text-black text-[10px] font-bold disabled:opacity-50"
            >
              {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Generate 3D
            </button>
            <button type="button" className="text-[10px] opacity-60" onClick={() => setStagedImage(null)}>
              Clear
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => imgRef.current?.click()}
            className={`flex items-center gap-1 text-[10px] font-bold ${themeMuted}`}
          >
            <ImagePlus className="w-3.5 h-3.5" />
            Add reference image
          </button>
        )}
        <input
          ref={imgRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const r = new FileReader();
            r.onload = () => setStagedImage(r.result as string);
            r.readAsDataURL(f);
            e.target.value = '';
          }}
        />
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe your 3D asset — materials, silhouette, style…"
            rows={compact ? 3 : 4}
            className={`flex-1 rounded-xl border ${border} bg-black/20 px-3 py-2.5 text-[13px] leading-snug resize-none ${themeInk}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSendText();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void handleSendText()}
            disabled={isGenerating || !input.trim()}
            className="self-end shrink-0 p-3 rounded-xl bg-brand-primary text-black disabled:opacity-40 shadow-md shadow-brand-primary/20"
          >
            {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
        {isGenerating && meshyProgress > 0 ? (
          <div className="h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-brand-primary transition-all"
              style={{ width: `${Math.min(100, meshyProgress)}%` }}
            />
          </div>
        ) : null}
        <p className={`text-[10px] flex items-center gap-1.5 ${themeMuted}`}>
          <Box className="w-3.5 h-3.5 shrink-0" />
          When a GLB is ready it attaches to this project. Not satisfied? Use &quot;Hire a 3D designer&quot; above for pro
          refinement.
        </p>
      </div>
    </div>
  );
}
