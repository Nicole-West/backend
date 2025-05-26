const express = require('express');
const router = express.Router();
const nextMonthController = require('../controllers/nextMonthController');

// Получить текущий месяц и год
router.get('/current-month', nextMonthController.getCurrentMonth);

// Перейти на следующий месяц
router.post('/next-month', nextMonthController.moveToNextMonth);

module.exports = router;
