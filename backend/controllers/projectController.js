const mongoose = require('mongoose');
const StudioProject = require('../models/StudioProject');
const ProjectChatMessage = require('../models/ProjectChatMessage');
const { toClientProject, toClientMessage } = require('../utils/projectMapper');

function badId(res) {
  return res.status(400).json({ message: 'Invalid project id' });
}

exports.listProjects = async (req, res) => {
  try {
    const docs = await StudioProject.find({ userId: req.user._id }).sort({ updatedAt: -1 }).lean();
    res.json({ projects: docs.map((d) => toClientProject(d)) });
  } catch (e) {
    console.error('listProjects', e);
    res.status(500).json({ message: 'Failed to list projects' });
  }
};

exports.createProject = async (req, res) => {
  try {
    const { name, description } = req.body || {};
    const n = typeof name === 'string' && name.trim() ? name.trim() : 'Untitled Project';
    const desc = typeof description === 'string' ? description : 'A new AR experience with ARdya.';
    const doc = await StudioProject.create({
      userId: req.user._id,
      name: n.slice(0, 200),
      description: desc.slice(0, 2000),
      status: 'draft',
    });
    res.status(201).json({ project: toClientProject(doc) });
  } catch (e) {
    console.error('createProject', e);
    res.status(500).json({ message: 'Failed to create project' });
  }
};

exports.getProject = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return badId(res);
    const doc = await StudioProject.findOne({ _id: id, userId: req.user._id });
    if (!doc) return res.status(404).json({ message: 'Project not found' });
    res.json({ project: toClientProject(doc) });
  } catch (e) {
    console.error('getProject', e);
    res.status(500).json({ message: 'Failed to get project' });
  }
};

const PATCHABLE = new Set([
  'name',
  'description',
  'status',
  'modelUrl',
  'thumbnailUrl',
  'meshyPreviewTaskId',
  'meshyTaskId',
  'modelUrls',
  'useCase',
  'category',
  'studioTransforms',
  'studioRigs',
  'studioExtras',
  'logoScale',
  'logoOffsetY',
]);

exports.updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return badId(res);
    const body = req.body || {};
    const updates = {};
    for (const key of PATCHABLE) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (updates.name && typeof updates.name === 'string') {
      updates.name = updates.name.trim().slice(0, 200);
    }
    if (updates.description && typeof updates.description === 'string') {
      updates.description = updates.description.slice(0, 2000);
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }
    const doc = await StudioProject.findOneAndUpdate(
      { _id: id, userId: req.user._id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ message: 'Project not found' });
    res.json({ project: toClientProject(doc) });
  } catch (e) {
    console.error('updateProject', e);
    res.status(500).json({ message: 'Failed to update project' });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return badId(res);
    const del = await StudioProject.findOneAndDelete({ _id: id, userId: req.user._id });
    if (!del) return res.status(404).json({ message: 'Project not found' });
    await ProjectChatMessage.deleteMany({ projectId: id });
    res.json({ message: 'Project deleted' });
  } catch (e) {
    console.error('deleteProject', e);
    res.status(500).json({ message: 'Failed to delete project' });
  }
};

exports.listChat = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return badId(res);
    const owns = await StudioProject.exists({ _id: id, userId: req.user._id });
    if (!owns) return res.status(404).json({ message: 'Project not found' });
    const msgs = await ProjectChatMessage.find({ projectId: id }).sort({ createdAt: 1 }).lean();
    res.json({ messages: msgs.map((m) => toClientMessage(m)) });
  } catch (e) {
    console.error('listChat', e);
    res.status(500).json({ message: 'Failed to load chat' });
  }
};

exports.appendChat = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return badId(res);
    const owns = await StudioProject.exists({ _id: id, userId: req.user._id });
    if (!owns) return res.status(404).json({ message: 'Project not found' });

    const {
      role,
      content,
      images,
      modelUrl,
      modelUrls,
      meshyTaskId,
      clientMessageId,
    } = req.body || {};

    if (role !== 'user' && role !== 'assistant') {
      return res.status(400).json({ message: 'role must be user or assistant' });
    }
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: 'content is required' });
    }

    if (clientMessageId) {
      const existing = await ProjectChatMessage.findOne({
        projectId: id,
        clientMessageId: String(clientMessageId),
      });
      if (existing) {
        return res.status(200).json({ message: toClientMessage(existing) });
      }
    }

    const doc = await ProjectChatMessage.create({
      projectId: id,
      userId: req.user._id,
      role,
      content: content.slice(0, 32000),
      images: Array.isArray(images) ? images.filter((x) => typeof x === 'string').slice(0, 20) : undefined,
      modelUrl: typeof modelUrl === 'string' ? modelUrl : undefined,
      modelUrls: modelUrls && typeof modelUrls === 'object' ? modelUrls : undefined,
      meshyTaskId: typeof meshyTaskId === 'string' ? meshyTaskId : undefined,
      clientMessageId: clientMessageId ? String(clientMessageId).slice(0, 64) : undefined,
    });

    res.status(201).json({ message: toClientMessage(doc) });
  } catch (e) {
    console.error('appendChat', e);
    res.status(500).json({ message: 'Failed to save message' });
  }
};
