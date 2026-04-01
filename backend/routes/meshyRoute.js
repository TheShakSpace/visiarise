const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  generate3DModel,
  generateFromImage,
  proxyModelAsset,
  getTaskStatus,
  getUserTasks,
  deleteTask,
  refineModel,
} = require('../controllers/meshyController');

// All routes require authentication
router.use(protect);

// @route   POST /api/meshy/generate
// @desc    Create a new 3D generation task
// @access  Private
router.post('/generate', generate3DModel);

// @route   POST /api/meshy/generate-from-image
router.post('/generate-from-image', generateFromImage);

// @route   POST /api/meshy/proxy-asset — same-origin fetch for Meshy CDN (CORS)
router.post('/proxy-asset', proxyModelAsset);

// @route   GET /api/meshy/tasks
// @desc    Get all tasks for the authenticated user
// @access  Private
router.get('/tasks', getUserTasks);

// @route   GET /api/meshy/task/:taskId
// @desc    Get status of a specific task
// @access  Private
router.get('/task/:taskId', getTaskStatus);

// @route   DELETE /api/meshy/task/:taskId
// @desc    Delete a task
// @access  Private
router.delete('/task/:taskId', deleteTask);

// @route   POST /api/meshy/refine/:taskId
// @desc    Refine a preview model
// @access  Private
router.post('/refine/:taskId', refineModel);

module.exports = router;
