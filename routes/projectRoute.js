const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  listChat,
  appendChat,
} = require('../controllers/projectController');

router.use(protect);

router.get('/', listProjects);
router.post('/', createProject);
router.get('/:id/chat', listChat);
router.post('/:id/chat', appendChat);
router.get('/:id', getProject);
router.patch('/:id', updateProject);
router.delete('/:id', deleteProject);

module.exports = router;
