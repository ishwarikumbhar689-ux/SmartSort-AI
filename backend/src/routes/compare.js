const express = require('express');
const { compare } = require('../controllers/compareController');

const router = express.Router();

router.post('/', compare);

module.exports = router;
