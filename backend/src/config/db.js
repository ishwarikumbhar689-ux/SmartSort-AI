// MongoDB (Mongoose) data layer.
// Same function names as the old in-memory version, but every function
// is now async, so controllers must `await` them.

const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not set in .env');
  }
  await mongoose.connect(uri);
  console.log('✅ MongoDB connected');
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const historySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    productAName: { type: String, required: true },
    productBName: { type: String, required: true },
    category: String,
    purpose: String,
    winner: String,
    favorite: { type: Boolean, default: false },
    result: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model('User', userSchema);
const History = mongoose.models.History || mongoose.model('History', historySchema);

// Convert a lean Mongo document to the shape controllers expect (string _id)
function clean(doc) {
  if (!doc) return null;
  return { ...doc, _id: String(doc._id) };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

module.exports = {
  connectDB,
  users: {
    async create(user) {
      const doc = await User.create(user);
      return clean(doc.toObject());
    },
    async findByEmail(email) {
      if (!email) return null;
      return clean(await User.findOne({ email: String(email).toLowerCase().trim() }).lean());
    },
    async findById(id) {
      if (!isValidId(id)) return null;
      return clean(await User.findById(id).lean());
    },
  },
  history: {
    async create(item) {
      const doc = await History.create(item);
      return clean(doc.toObject());
    },
    async findByUser(userId, query) {
      const filter = { userId: String(userId) };
      if (query) {
        const rx = new RegExp(escapeRegex(query), 'i');
        filter.$or = [{ productAName: rx }, { productBName: rx }];
      }
      const items = await History.find(filter).sort({ createdAt: -1 }).lean();
      return items.map(clean);
    },
    async findById(id) {
      if (!isValidId(id)) return null;
      return clean(await History.findById(id).lean());
    },
    async toggleFavorite(id) {
      if (!isValidId(id)) return null;
      const item = await History.findById(id);
      if (!item) return null;
      item.favorite = !item.favorite;
      await item.save();
      return clean(item.toObject());
    },
    async remove(id) {
      if (!isValidId(id)) return false;
      const res = await History.deleteOne({ _id: id });
      return res.deletedCount > 0;
    },
  },
};