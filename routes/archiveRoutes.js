const express = require('express');
const router = express.Router();
const db = require('../db');
const archiveController = require('../controllers/archiveController');

const authMiddleware = require('../middleware/auth');

router.get('/filters', authMiddleware, archiveController.getArchiveFilters);
router.get('/data', authMiddleware, archiveController.getArchiveData );

module.exports = router;