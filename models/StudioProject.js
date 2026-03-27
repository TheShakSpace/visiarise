const mongoose = require('mongoose');

const modelUrlsSchema = new mongoose.Schema(
  {
    glb: String,
    fbx: String,
    usdz: String,
    obj: String,
    mtl: String,
    stl: String,
  },
  { _id: false }
);

const studioExtraSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, default: '' },
    modelUrl: String,
  },
  { _id: false }
);

const studioProjectSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
    },
    modelUrl: String,
    thumbnailUrl: String,
    meshyPreviewTaskId: String,
    /** Latest Meshy task id used for this project's primary model (often refine). */
    meshyTaskId: String,
    modelUrls: modelUrlsSchema,
    useCase: { type: String, default: '' },
    category: { type: String, default: '' },
    studioTransforms: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** Motion rig preview configs keyed by scene node id (primary / extra ids). */
    studioRigs: { type: mongoose.Schema.Types.Mixed, default: {} },
    studioExtras: [studioExtraSchema],
    logoScale: Number,
    logoOffsetY: Number,
  },
  { timestamps: true }
);

studioProjectSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('StudioProject', studioProjectSchema);
