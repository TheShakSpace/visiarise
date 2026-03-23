const axios = require('axios');
const Meshy3DTask = require('../models/Meshy3DTask');

const MESHY_API_BASE_URL = 'https://api.meshy.ai/v2';

// Helper function to get Meshy API key from environment
const getMeshyApiKey = () => {
  if (!process.env.MESHY_API_KEY) {
    throw new Error('MESHY_API_KEY is not configured in environment variables');
  }
  return process.env.MESHY_API_KEY;
};

// @desc    Create a new 3D generation task
// @route   POST /api/meshy/generate
// @access  Private
exports.generate3DModel = async (req, res) => {
  const { prompt, mode = 'preview', art_style = 'realistic' } = req.body;

  try {
    // Validate input
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    const apiKey = getMeshyApiKey();

    // Create task in Meshy API
    const createRes = await axios.post(
      `${MESHY_API_BASE_URL}/text-to-3d`,
      {
        prompt,
        mode,
        art_style,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const taskId = createRes.data.result;

    // Save task to database
    const task = await Meshy3DTask.create({
      userId: req.user._id,
      taskId,
      prompt,
      mode,
      artStyle: art_style,
      status: 'PENDING',
    });

    res.status(201).json({
      message: '3D generation task created successfully',
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
    console.error('Generate 3D Model Error:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Failed to create 3D generation task',
      error: error.response?.data?.message || error.message,
    });
  }
};

// @desc    Get status of a 3D generation task
// @route   GET /api/meshy/task/:taskId
// @access  Private
exports.getTaskStatus = async (req, res) => {
  const { taskId } = req.params;

  try {
    // Find task in database
    const task = await Meshy3DTask.findOne({ taskId, userId: req.user._id });

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const apiKey = getMeshyApiKey();

    // Get status from Meshy API
    const statusRes = await axios.get(
      `${MESHY_API_BASE_URL}/text-to-3d/${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const meshyData = statusRes.data;

    // Update task in database
    task.status = meshyData.status;
    task.progress = meshyData.progress || 0;

    if (meshyData.status === 'SUCCEEDED') {
      task.modelUrls = {
        glb: meshyData.model_urls?.glb,
        fbx: meshyData.model_urls?.fbx,
        usdz: meshyData.model_urls?.usdz,
        obj: meshyData.model_urls?.obj,
        mtl: meshyData.model_urls?.mtl,
      };
      task.thumbnailUrl = meshyData.thumbnail_url;
      task.videoUrl = meshyData.video_url;
      task.completedAt = new Date();
    } else if (meshyData.status === 'FAILED') {
      task.errorMessage = meshyData.error || 'Generation failed';
    }

    await task.save();

    res.json({
      task: {
        _id: task._id,
        taskId: task.taskId,
        prompt: task.prompt,
        mode: task.mode,
        artStyle: task.artStyle,
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

// @desc    Get all tasks for the authenticated user
// @route   GET /api/meshy/tasks
// @access  Private
exports.getUserTasks = async (req, res) => {
  try {
    const { status, limit = 20, page = 1 } = req.query;

    const query = { userId: req.user._id };
    if (status) {
      query.status = status;
    }

    const tasks = await Meshy3DTask.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Meshy3DTask.countDocuments(query);

    res.json({
      tasks,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Get User Tasks Error:', error.message);
    res.status(500).json({
      message: 'Failed to get user tasks',
      error: error.message,
    });
  }
};

// @desc    Delete a task
// @route   DELETE /api/meshy/task/:taskId
// @access  Private
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
    res.status(500).json({
      message: 'Failed to delete task',
      error: error.message,
    });
  }
};

// @desc    Refine a preview model
// @route   POST /api/meshy/refine/:taskId
// @access  Private
exports.refineModel = async (req, res) => {
  const { taskId } = req.params;

  try {
    // Find the preview task
    const previewTask = await Meshy3DTask.findOne({ 
      taskId, 
      userId: req.user._id,
      mode: 'preview',
      status: 'SUCCEEDED'
    });

    if (!previewTask) {
      return res.status(404).json({ 
        message: 'Preview task not found or not completed' 
      });
    }

    const apiKey = getMeshyApiKey();

    // Create refine task in Meshy API
    const createRes = await axios.post(
      `${MESHY_API_BASE_URL}/text-to-3d`,
      {
        mode: 'refine',
        preview_task_id: taskId,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const refineTaskId = createRes.data.result;

    // Save refine task to database
    const refineTask = await Meshy3DTask.create({
      userId: req.user._id,
      taskId: refineTaskId,
      prompt: previewTask.prompt,
      mode: 'refine',
      artStyle: previewTask.artStyle,
      status: 'PENDING',
    });

    res.status(201).json({
      message: 'Refine task created successfully',
      task: {
        _id: refineTask._id,
        taskId: refineTask.taskId,
        prompt: refineTask.prompt,
        mode: refineTask.mode,
        artStyle: refineTask.artStyle,
        status: refineTask.status,
        createdAt: refineTask.createdAt,
      },
    });
  } catch (error) {
    console.error('Refine Model Error:', error.response?.data || error.message);
    res.status(500).json({
      message: 'Failed to create refine task',
      error: error.response?.data?.message || error.message,
    });
  }
};

// Made with Bob
