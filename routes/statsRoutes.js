// routes/statsRoutes.js
const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

router.get('/current-zeros', 
  statsController.getCurrentStats
);

// Список групп
router.get('/groups',
  statsController.getGroups
);

// Список предметов
router.get('/subjects',
  statsController.getSubjects
);

router.get('/group-subjects',
  statsController.getGroupSubjects
);

router.get('/export-grades', 
  statsController.exportGrades
);

module.exports = router;