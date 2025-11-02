const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  nameAr: { type: String },
  description: { type: String, required: true },
  descriptionAr: { type: String },
  price: { type: Number, required: true },
  category: { type: String, required: true },
  image: { type: String, required: true },
  images: [String],
  stock: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);
