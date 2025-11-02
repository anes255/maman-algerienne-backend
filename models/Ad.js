const mongoose = require('mongoose');

const adSchema = new mongoose.Schema({
  title: { type: String, required: true },
  image: { type: String, required: true },
  link: { type: String },
  position: { type: String, enum: ['hero', 'sidebar', 'banner', 'sponsor'], default: 'banner' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Ad', adSchema);
