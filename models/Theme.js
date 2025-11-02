const mongoose = require('mongoose');

const themeSchema = new mongoose.Schema({
  primaryColor: { type: String, default: '#FF69B4' },
  secondaryColor: { type: String, default: '#FFC0CB' },
  accentColor: { type: String, default: '#FFB6C1' },
  backgroundColor: { type: String, default: '#FFF5F7' },
  textColor: { type: String, default: '#333333' },
  fontFamily: { type: String, default: 'Cairo, sans-serif' },
  logoText: { type: String, default: 'Maman Algérienne' },
  logoImage: { type: String },
  favicon: { type: String },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Theme', themeSchema);
