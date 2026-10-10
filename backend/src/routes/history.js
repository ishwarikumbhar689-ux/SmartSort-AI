const express = require('express');
const {
  createHistory,
  listHistory,
  toggleFavorite,
  deleteHistory
} = require('../controllers/historyController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.post('/', createHistory);
router.get('/', listHistory);
router.patch('/:id/favorite', toggleFavorite);
router.delete('/:id', deleteHistory);

module.exports = router;
