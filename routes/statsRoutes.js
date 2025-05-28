// routes/statsRoutes.js
const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

router.get('/current-zeros', statsController.getCurrentStats);

router.get('/export-grades', statsController.exportGroupSubjectGrades);

module.exports = router;