const axios = require('axios');
const Meshy3DTask = require('../models/Meshy3DTask');
const { assertCanAfford, deductCredits, getCreditsRemaining, previewCost, refineCost } = require('../utils/credits');

const MESHY_API_BASE = 'https://api.meshy.ai/openapi/v2';
/** Image-to-3D lives on v1 OpenAPI. */
const MESHY_IMAGE_API_BASE = 'https://api.meshy.ai/openapi/v1';
const AUTO_REFINE_POLL_MS = 3000;
const AUTO_REFINE_MAX_WAIT_MS = 15 * 60 * 1000;

const getMeshyApiKey = () => {
  if (!process.env.MESHY_API_KEY) {
    throw new Error('MESHY_API_KEY is not configured in environment variables');
  }
  return process.env.MESHY_API_KEY;
};

const meshyHeaders = () => ({
  Authorization: `Bearer ${getMeshyApiKey()}`,
  'Content-Type': 'application/json',
});

/** Prevent SSRF: only Meshy CDN asset URLs. */
function isAllowedMeshyAssetUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'assets.meshy.ai';
  } catch {
    return false;
  }
}

function mapPolyToTarget(poly) {
  if (poly === 'low') return 12000;
  if (poly === 'high') return 100000;
  return 30000;
}

function applyMeshyTaskToDoc(task, meshyData) {
  task.status = meshyData.status || task.status;
  task.progress = typeof meshyData.progress === 'number' ? meshyData.progress : task.progress ?? 0;

  const urls = meshyData.model_urls || {};
  if (meshyData.status === 'SUCCEEDED') {
    task.modelUrls = {
      glb: urls.glb,
      fbx: urls.fbx,
      usdz: urls.usdz,
      obj: urls.obj,
      mtl: urls.mtl,
      stl: urls.stl,
    };
    task.thumbnailUrl = meshyData.thumbnail_url;
    task.videoUrl = meshyData.video_url;
    task.completedAt = new Date();
  } else if (meshyData.status === 'FAILED') {
    const errMsg = meshyData.task_error?.message || meshyData.error || 'Generation failed';
    task.errorMessage = errMsg;
  }
}

async function createRefineAfterPreview(previewMeshyTaskId, userId, texturePrompt, enablePbr) {
  const previewTask = await Meshy3DTask.findOne({
    taskId: previewMeshyTaskId,
    userId,
    mode: 'preview',
    status: 'SUCCEEDED',
  });
  if (!previewTask) {
    const e = new Error('Completed preview task not found — generate a model first');
    e.status = 404;
    throw e;
  }
  const tex = (texturePrompt || '').trim().slice(0, 600);
  if (!tex) {
    const e = new Error('texture_prompt is required for texturing');
    e.status = 400;
    throw e;
  }
  const cost = refineCost();
  await assertCanAfford(userId, cost);
  const createRes = await axios.post(
    `${MESHY_API_BASE}/text-to-3d`,
    {
      mode: 'refine',
      preview_task_id: previewMeshyTaskId,
      texture_prompt: tex,
      enable_pbr: !!enablePbr,
      ai_model: 'latest',
    },
    { headers: meshyHeaders() }
  );
  const refineTaskId = createRes.data.result;
  if (!refineTaskId) {
    const e = new Error('Meshy did not return a refine task id');
    e.status = 502;
    throw e;
  }
  const refineTask = await Meshy3DTask.create({
    userId,
    taskId: refineTaskId,
    prompt: previewTask.prompt,
    meshyApiKind: previewTask.meshyApiKind || 'text_to_3d',
    mode: 'refine',
    artStyle: previewTask.artStyle || '',
    texturePrompt: tex,
    status: 'PENDING',
  });
  await deductCredits(userId, cost);
  await Meshy3DTask.updateOne(
    { taskId: previewMeshyTaskId, userId },
    { $set: { linkedRefineTaskId: refineTaskId, autoRefineError: '' } }
  );
  return { refineTask, creditsCharged: cost };
}

async function runAutoRefineAfterPreview(previewMeshyTaskId, userId, texturePrompt, enablePbr) {
  const deadline = Date.now() + AUTO_REFINE_MAX_WAIT_MS;
  const setPreviewRefineError = async (msg) => {
    await Meshy3DTask.updateOne(
      { taskId: previewMeshyTaskId, userId },
      { $set: { autoRefineError: msg } }
    );
  };

  try {
    while (Date.now() < deadline) {
      const statusRes = await axios.get(`${MESHY_API_BASE}/text-to-3d/${previewMeshyTaskId}`, {
        headers: { Authorization: `Bearer ${getMeshyApiKey()}` },
      });
      const meshyData = statusRes.data;
      const task = await Meshy3DTask.findOne({ taskId: previewMeshyTaskId, userId });
      if (!task) return;
      applyMeshyTaskToDoc(task, meshyData);
      await task.save();

      const st = meshyData.status;
      if (st === 'FAILED' || st === 'EXPIRED') {
        await setPreviewRefineError('Preview did not succeed; texturing was skipped.');
        return;
      }
      if (st === 'SUCCEEDED') {
        const fresh = await Meshy3DTask.findOne({ taskId: previewMeshyTaskId, userId });
        if (fresh?.linkedRefineTaskId) return;
        try {
          await createRefineAfterPreview(previewMeshyTaskId, userId, texturePrompt, enablePbr);
        } catch (err) {
          const status = err.status || err.response?.status;
          const msg =
            status === 402
              ? err.message
              : err.response?.data?.message || err.message || 'Failed to start texturing';
          await setPreviewRefineError(msg);
        }
        return;
      }
      await new Promise((r) => setTimeout(r, AUTO_REFINE_POLL_MS));
    }
    await setPreviewRefineError('Automatic texturing timed out waiting for preview.');
  } catch (err) {
    console.error('runAutoRefineAfterPreview:', err.response?.data || err.message);
    await setPreviewRefineError(err.response?.data?.message || err.message || 'Automatic texturing failed').catch(
      () => {}
    );
  }
}

// POST /api/meshy/generate — preview mesh (geometry)
exports.generate3DModel = async (req, res) => {
  const {
    prompt,
    target_polycount,
    poly_budget,
    texture_prompt,
    texturePrompt,
    enable_pbr = true,
    auto_refine,
    autoRefine,
  } = req.body || {};

  try {
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    const wantsAutoRefine = !!(auto_refine ?? autoRefine);
    let textureForAuto = (texture_prompt || texturePrompt || '').trim().slice(0, 600);
    if (wantsAutoRefine && !textureForAuto) {
      textureForAuto = prompt.trim().slice(0, 600);
    }

    const previewCharge = previewCost();
    const refineCharge = refineCost();
    if (wantsAutoRefine) {
      await assertCanAfford(req.user._id, previewCharge + refineCharge);
    } else {
      await assertCanAfford(req.user._id, previewCharge);
    }

    const body = {
      mode: 'preview',
      prompt: prompt.trim().slice(0, 600),
      ai_model: 'latest',
    };

    const tp =
      typeof target_polycount === 'number'
        ? target_polycount
        : poly_budget
          ? mapPolyToTarget(poly_budget)
          : undefined;
    if (tp) {
      body.target_polycount = Math.min(300000, Math.max(100, Math.round(tp)));
      body.should_remesh = true;
    }

    const createRes = await axios.post(`${MESHY_API_BASE}/text-to-3d`, body, {
      headers: meshyHeaders(),
    });

    const taskId = createRes.data.result;
    if (!taskId) {
      return res.status(502).json({ message: 'Meshy did not return a task id' });
    }

    const task = await Meshy3DTask.create({
      userId: req.user._id,
      taskId,
      prompt: body.prompt,
      meshyApiKind: 'text_to_3d',
      mode: 'preview',
      artStyle: '',
      texturePrompt: wantsAutoRefine ? textureForAuto : '',
      status: 'PENDING',
    });

    await deductCredits(req.user._id, previewCharge);
    const creditsRemaining = await getCreditsRemaining(req.user._id);

    if (wantsAutoRefine) {
      setImmediate(() => {
        runAutoRefineAfterPreview(task.taskId, req.user._id, textureForAuto, !!enable_pbr).catch((err) =>
          console.error('runAutoRefineAfterPreview (unhandled):', err)
        );
      });
    }

    res.status(201).json({
      message: wantsAutoRefine
        ? '3D preview started; texturing runs automatically when preview completes'
        : '3D preview task created',
      autoRefine: wantsAutoRefine,
      creditsCharged: previewCharge,
      creditsRemaining,
      task: {
        _id: task._id,
        taskId: task.taskId,
        prompt: task.prompt,
        mode: task.mode,
        artStyle: task.artStyle,
        texturePrompt: task.texturePrompt,
        status: task.status,
        createdAt: task.createdAt,
      },
    });
  } catch (error) {
    const status = error.status || error.response?.status;
    if (status === 402) {
      return res.status(402).json({ message: error.message });
    }
    console.error('Generate 3D Model Error:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Failed to create 3D generation task',
      error: error.response?.data?.message || error.message,
    });
  }
};

// POST /api/meshy/generate-from-image — Meshy image-to-3d (v1 API)
exports.generateFromImage = async (req, res) => {
  const {
    image_url,
    image_data_url,
    poly_budget,
    should_texture = true,
    enable_pbr = true,
  } = req.body || {};
  const imageUrl = String(image_data_url || image_url || '').trim();

  try {
    if (!imageUrl) {
      return res.status(400).json({ message: 'image_data_url or image_url is required' });
    }
    if (
      !imageUrl.startsWith('data:image/jpeg') &&
      !imageUrl.startsWith('data:image/jpg') &&
      !imageUrl.startsWith('data:image/png') &&
      !imageUrl.startsWith('data:image/webp') &&
      !/^https:\/\//i.test(imageUrl)
    ) {
      return res.status(400).json({
        message: 'Image must be a data URL (JPEG/PNG/WebP) or an https URL',
      });
    }

    const cost = previewCost();
    await assertCanAfford(req.user._id, cost);

    const body = {
      image_url: imageUrl,
      ai_model: 'latest',
      should_texture: !!should_texture,
      enable_pbr: !!enable_pbr,
      should_remesh: true,
    };
    const tp =
      typeof req.body?.target_polycount === 'number'
        ? req.body.target_polycount
        : poly_budget
          ? mapPolyToTarget(poly_budget)
          : undefined;
    if (tp) {
      body.target_polycount = Math.min(300000, Math.max(100, Math.round(tp)));
    }

    const createRes = await axios.post(`${MESHY_IMAGE_API_BASE}/image-to-3d`, body, {
      headers: meshyHeaders(),
    });

    const newTaskId = createRes.data.result;
    if (!newTaskId) {
      return res.status(502).json({ message: 'Meshy did not return a task id' });
    }

    const task = await Meshy3DTask.create({
      userId: req.user._id,
      taskId: newTaskId,
      prompt: '[image-to-3d]',
      meshyApiKind: 'image_to_3d',
      mode: 'preview',
      artStyle: '',
      texturePrompt: '',
      status: 'PENDING',
    });

    await deductCredits(req.user._id, cost);
    const creditsRemaining = await getCreditsRemaining(req.user._id);

    res.status(201).json({
      message: 'Image-to-3D task created',
      creditsCharged: cost,
      creditsRemaining,
      task: {
        _id: task._id,
        taskId: task.taskId,
        prompt: task.prompt,
        meshyApiKind: task.meshyApiKind,
        mode: task.mode,
        status: task.status,
        createdAt: task.createdAt,
      },
    });
  } catch (error) {
    const status = error.status || error.response?.status;
    if (status === 402) {
      return res.status(402).json({ message: error.message });
    }
    console.error('Generate From Image Error:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Failed to create image-to-3D task',
      error: error.response?.data?.message || error.message,
    });
  }
};

// POST /api/meshy/proxy-asset — fetch Meshy CDN GLB/texture in-browser (avoids CORS)
exports.proxyModelAsset = async (req, res) => {
  const { url } = req.body || {};
  try {
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ message: 'url is required' });
    }
    if (!isAllowedMeshyAssetUrl(url)) {
      return res.status(400).json({ message: 'Only https://assets.meshy.ai/ URLs are allowed' });
    }
    const r = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: 80 * 1024 * 1024,
      maxBodyLength: 80 * 1024 * 1024,
    });
    const ct = r.headers['content-type'] || 'model/gltf-binary';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(r.data));
  } catch (error) {
    console.error('proxyModelAsset:', error.response?.status || error.message);
    res.status(502).json({
      message: 'Could not fetch asset from Meshy',
      error: error.response?.data?.message || error.message,
    });
  }
};

// GET /api/meshy/task/:taskId
exports.getTaskStatus = async (req, res) => {
  const { taskId } = req.params;

  try {
    const task = await Meshy3DTask.findOne({ taskId, userId: req.user._id });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const meshyPath =
      task.meshyApiKind === 'image_to_3d'
        ? `${MESHY_IMAGE_API_BASE}/image-to-3d/${taskId}`
        : `${MESHY_API_BASE}/text-to-3d/${taskId}`;

    const statusRes = await axios.get(meshyPath, {
      headers: { Authorization: `Bearer ${getMeshyApiKey()}` },
    });

    const meshyData = statusRes.data;
    applyMeshyTaskToDoc(task, meshyData);
    await task.save();

    res.json({
      task: {
        _id: task._id,
        taskId: task.taskId,
        prompt: task.prompt,
        meshyApiKind: task.meshyApiKind || 'text_to_3d',
        mode: task.mode,
        artStyle: task.artStyle,
        texturePrompt: task.texturePrompt,
        status: task.status,
        progress: task.progress,
        modelUrls: task.modelUrls,
        thumbnailUrl: task.thumbnailUrl,
        videoUrl: task.videoUrl,
        errorMessage: task.errorMessage,
        linkedRefineTaskId: task.linkedRefineTaskId || undefined,
        autoRefineError: task.autoRefineError || undefined,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
      },
    });
  } catch (error) {
    console.error('Get Task Status Error:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Failed to get task status',
      error: error.response?.data?.message || error.message,
    });
  }
};

exports.getUserTasks = async (req, res) => {
  try {
    const { status, limit = 20, page = 1 } = req.query;
    const query = { userId: req.user._id };
    if (status) query.status = status;

    const tasks = await Meshy3DTask.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit, 10))
      .skip((parseInt(page, 10) - 1) * parseInt(limit, 10));

    const total = await Meshy3DTask.countDocuments(query);

    res.json({
      tasks,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    console.error('Get User Tasks Error:', error.message);
    res.status(500).json({ message: 'Failed to get user tasks', error: error.message });
  }
};

exports.deleteTask = async (req, res) => {
  const { taskId } = req.params;
  try {
    const task = await Meshy3DTask.findOne({ taskId, userId: req.user._id });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }
    await task.deleteOne();
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete Task Error:', error.message);
    res.status(500).json({ message: 'Failed to delete task', error: error.message });
  }
};

// POST /api/meshy/refine/:taskId — textured refine from a completed preview
exports.refineModel = async (req, res) => {
  const { taskId } = req.params;
  const { texture_prompt, texturePrompt, enable_pbr = true } = req.body || {};
  const tex = (texture_prompt || texturePrompt || '').trim().slice(0, 600);

  try {
    if (!tex) {
      return res.status(400).json({ message: 'texture_prompt is required for texturing' });
    }

    const { refineTask, creditsCharged } = await createRefineAfterPreview(taskId, req.user._id, tex, !!enable_pbr);
    const creditsRemaining = await getCreditsRemaining(req.user._id);

    res.status(201).json({
      message: 'Texturing task created',
      creditsCharged,
      creditsRemaining,
      task: {
        _id: refineTask._id,
        taskId: refineTask.taskId,
        prompt: refineTask.prompt,
        mode: refineTask.mode,
        texturePrompt: refineTask.texturePrompt,
        status: refineTask.status,
        createdAt: refineTask.createdAt,
      },
    });
  } catch (error) {
    const status = error.status || error.response?.status;
    if (status === 402) {
      return res.status(402).json({ message: error.message });
    }
    if (status === 404) {
      return res.status(404).json({ message: error.message });
    }
    if (status === 400) {
      return res.status(400).json({ message: error.message });
    }
    if (status === 502) {
      return res.status(502).json({ message: error.message });
    }
    console.error('Refine Model Error:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Failed to create refine task',
      error: error.response?.data?.message || error.message,
    });
  }
};
