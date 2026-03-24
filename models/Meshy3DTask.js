const mongoose = require('mongoose');

const meshy3DTaskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    taskId: {
      type: String,
      required: true,
      unique: true,
    },
    prompt: {
      type: String,
      default: '',
    },
    /** Which Meshy API created this task (polls use different paths). */
    meshyApiKind: {
      type: String,
      enum: ['text_to_3d', 'image_to_3d'],
      default: 'text_to_3d',
    },
    mode: {
      type: String,
      enum: ['preview', 'refine'],
      default: 'preview',
    },
    artStyle: {
      type: String,
      enum: ['realistic', 'cartoon', 'low-poly', 'sculpture', 'pbr', ''],
      default: 'realistic',
    },
    texturePrompt: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['PENDING', 'IN_PROGRESS', 'SUCCEEDED', 'FAILED', 'EXPIRED'],
      default: 'PENDING',
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    modelUrls: {
      glb: String,
      fbx: String,
      usdz: String,
      obj: String,
      mtl: String,
      stl: String,
    },
    thumbnailUrl: String,
    videoUrl: String,
    /** When generate used auto_refine, Meshy refine task id (client polls this for textured GLB). */
    linkedRefineTaskId: { type: String, default: '' },
    /** Set if automatic refine failed after preview succeeded. */
    autoRefineError: { type: String, default: '' },
    errorMessage: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: Date,
  },
  {
    timestamps: true,
  }
);

meshy3DTaskSchema.index({ userId: 1, createdAt: -1 });
/* taskId: unique: true already creates an index — do not add meshy3DTaskSchema.index({ taskId }) */
meshy3DTaskSchema.index({ status: 1 });

module.exports = mongoose.model('Meshy3DTask', meshy3DTaskSchema);
