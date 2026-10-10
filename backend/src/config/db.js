// Simple in-memory "database". Swap this file for real Mongoose models
// later — controllers only touch the methods below, so nothing else
// needs to change when you add persistence.

const { randomUUID } = require('crypto');

const users = [];      // { _id, name, email, passwordHash }
const historyItems = []; // { _id, userId, productAName, productBName, category, purpose, winner, favorite, result, createdAt }

module.exports = {
  users: {
    create(user) {
      const record = { _id: randomUUID(), ...user };
      users.push(record);
      return record;
    },
    findByEmail(email) {
      return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    },
    findById(id) {
      return users.find((u) => u._id === id);
    }
  },
  history: {
    create(item) {
      const record = {
        _id: randomUUID(),
        favorite: false,
        createdAt: new Date().toISOString(),
        ...item
      };
      historyItems.push(record);
      return record;
    },
    findByUser(userId, query) {
      let items = historyItems.filter((h) => h.userId === userId);
      if (query) {
        const q = query.toLowerCase();
        items = items.filter(
          (h) =>
            h.productAName.toLowerCase().includes(q) ||
            h.productBName.toLowerCase().includes(q)
        );
      }
      return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    findById(id) {
      return historyItems.find((h) => h._id === id);
    },
    toggleFavorite(id) {
      const item = historyItems.find((h) => h._id === id);
      if (!item) return null;
      item.favorite = !item.favorite;
      return item;
    },
    remove(id) {
      const idx = historyItems.findIndex((h) => h._id === id);
      if (idx === -1) return false;
      historyItems.splice(idx, 1);
      return true;
    }
  }
};
