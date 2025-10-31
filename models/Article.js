const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  titleAr: { type: String },
  content: { type: String, required: true },
  contentAr: { type: String },
  category: { type: String, required: true },
  image: { type: String, required: true },
  contentImages: [String],
  // Enhanced content blocks for flexible article creation
  contentBlocks: [{
    id: String,
    type: { type: String, enum: ['heading', 'paragraph', 'image', 'video'], required: true },
    content: String, // For heading/paragraph text
    imageUrl: String, // For image blocks
    videoUrl: String, // For video blocks
    settings: {
      headingSize: { type: String, enum: ['h2', 'h3', 'h4'], default: 'h2' }, // For headings
      imageSize: { type: String, enum: ['small', 'medium', 'large', 'full'], default: 'medium' }, // For images
      videoSize: { type: String, enum: ['medium', 'large', 'full'], default: 'large' }, // For videos
      alignment: { type: String, enum: ['left', 'center', 'right'], default: 'left' }
    },
    order: Number
  }],
  author: { type: String, default: 'Admin' },
  featured: { type: Boolean, default: false },
  views: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Article', articleSchema);
