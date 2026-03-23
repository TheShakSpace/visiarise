const axios = require('axios');
const Meshy3DTask = require('../models/Meshy3DTask');
const { assertCanAfford, deductCredits, getCreditsRemaining, previewCost, refineCost } = require('../utils/credits');

const MESHY_API_BASE = 'https://api.meshy.ai/openapi/v2';

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

// POST /api/meshy/generate — preview mesh (geometry)
exports.generate3DModel = async (req, res) => {
  const { prompt, target_polycount, poly_budget } = req.body;

  try {
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    const cost = previewCost();
    await assertCanAfford(req.user._id, cost);

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
      mode: 'preview',
      artStyle: '',
      status: 'PENDING',
    });

    await deductCredits(req.user._id, cost);
    const creditsRemaining = await getCreditsRemaining(req.user._id);

    res.status(201).json({
      message: '3D preview task created',
      creditsCharged: cost,
      creditsRemaining,
      task: {
        _id: task._id,
        taskId: task.taskId,
        prompt: task.prompt,
        mode: task.mode,
        artStyle: task.artStyle,
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

// GET /api/meshy/task/:taskId
exports.getTaskStatus = async (req, res) => {
  const { taskId } = req.params;

  try {
    const task = await Meshy3DTask.findOne({ taskId, userId: req.user._id });
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const statusRes = await axios.get(`${MESHY_API_BASE}/text-to-3d/${taskId}`, {
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
        mode: task.mode,
        artStyle: task.artStyle,
        texturePrompt: task.texturePrompt,
        status: task.status,
        progress: task.progress,
        modelUrls: task.modelUrls,
        thumbnailUrl: task.thumbnailUrl,
        videoUrl: task.videoUrl,
        errorMessage: task.errorMessage,
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
    const previewTask = await Meshy3DTask.findOne({
      taskId,
      userId: req.user._id,
      mode: 'preview',
      status: 'SUCCEEDED',
    });

    if (!previewTask) {
      return res.status(404).json({
        message: 'Completed preview task not found — generate a model first',
      });
    }

    if (!tex) {
      return res.status(400).json({ message: 'texture_prompt is required for texturing' });
    }

    const cost = refineCost();
    await assertCanAfford(req.user._id, cost);

    const createRes = await axios.post(
      `${MESHY_API_BASE}/text-to-3d`,
      {
        mode: 'refine',
        preview_task_id: taskId,
        texture_prompt: tex,
        enable_pbr: !!enable_pbr,
        ai_model: 'latest',
      },
      { headers: meshyHeaders() }
    );

    const refineTaskId = createRes.data.result;
    if (!refineTaskId) {
      return res.status(502).json({ message: 'Meshy did not return a refine task id' });
    }

    const refineTask = await Meshy3DTask.create({
      userId: req.user._id,
      taskId: refineTaskId,
      prompt: previewTask.prompt,
      mode: 'refine',
      artStyle: previewTask.artStyle || '',
      texturePrompt: tex,
      status: 'PENDING',
    });

    await deductCredits(req.user._id, cost);
    const creditsRemaining = await getCreditsRemaining(req.user._id);

    res.status(201).json({
      message: 'Texturing task created',
      creditsCharged: cost,
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
    console.error('Refine Model Error:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Failed to create refine task',
      error: error.response?.data?.message || error.message,
    });
  }
};
