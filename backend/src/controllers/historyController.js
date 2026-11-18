const db = require('../config/db');

async function createHistory(req, res) {
  try {
    const { productAName, productBName, category, purpose, winner, result } = req.body || {};
    if (!productAName || !productBName || !result) {
      return res.status(400).json({ error: 'productAName, productBName, and result are required.' });
    }

    const item = await db.history.create({
      userId: req.userId,
      productAName,
      productBName,
      category: category || null,
      purpose: purpose || null,
      winner: winner || null,
      result
    });

    return res.status(201).json({ item });
  } catch (err) {
    console.error('createHistory error:', err);
    return res.status(500).json({ error: 'Could not save comparison.' });
  }
}

async function listHistory(req, res) {
  try {
    const items = await db.history.findByUser(req.userId, req.query.q);
    return res.json({ items });
  } catch (err) {
    console.error('listHistory error:', err);
    return res.status(500).json({ error: 'Could not load history.' });
  }
}

async function toggleFavorite(req, res) {
  try {
    const item = await db.history.findById(req.params.id);
    if (!item || item.userId !== String(req.userId)) {
      return res.status(404).json({ error: 'Comparison not found.' });
    }
    const updated = await db.history.toggleFavorite(req.params.id);
    return res.json({ item: updated });
  } catch (err) {
    console.error('toggleFavorite error:', err);
    return res.status(500).json({ error: 'Could not update favorite.' });
  }
}

async function deleteHistory(req, res) {
  try {
    const item = await db.history.findById(req.params.id);
    if (!item || item.userId !== String(req.userId)) {
      return res.status(404).json({ error: 'Comparison not found.' });
    }
    await db.history.remove(req.params.id);
    return res.status(204).send();
  } catch (err) {
    console.error('deleteHistory error:', err);
    return res.status(500).json({ error: 'Could not delete comparison.' });
  }
}

module.exports = { createHistory, listHistory, toggleFavorite, deleteHistory };