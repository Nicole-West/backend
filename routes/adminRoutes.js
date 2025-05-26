// // routes/admin.js
// const express = require('express');
// const router = express.Router();
// const db = require('../db'); // Подключение к БД
// const checkAdmin = require('../middleware/checkAdmin');

// // GET /api/admin/unapproved-users
// router.get('/unapproved-users', checkAdmin, async (req, res) => {

//     console.log(`[GET] /api/admin/unapproved-users`);

//     try {
//         const [users] = await db.query(`
//       SELECT user_id, first_name, last_name, middle_name, email, role
//       FROM users
//       WHERE is_approved = false
//     `);

//         res.json({ users });
//     } catch (err) {
//         console.error('Ошибка получения неподтверждённых пользователей:', err);
//         res.status(500).json({ error: 'Ошибка сервера' });
//     }
// });

// // PUT /api/admin/approve-user/:id
// router.put('/approve-user/:id', checkAdmin, async (req, res) => {
//     const userId = req.params.id;
//     const { first_name, last_name, middle_name, email, role } = req.body;

//     try {
//         await db.query(`
//         UPDATE users
//         SET first_name = ?, last_name = ?, middle_name = ?, email = ?, role = ?, is_approved = true
//         WHERE user_id = ?
//       `, [first_name, last_name, middle_name, email, role, userId]);

//         res.json({ success: true });
//     } catch (err) {
//         console.error('Ошибка подтверждения пользователя:', err);
//         res.status(500).json({ error: 'Ошибка при подтверждении' });
//     }
// });

// module.exports = router;

// routes/admin.js
const express = require('express');
const router = express.Router();
const checkAdmin = require('../middleware/checkAdmin');
const adminController = require('../controllers/adminController');

// GET /api/admin/unapproved-users
router.get('/unapproved-users', checkAdmin, adminController.getUnapprovedUsers);

// PUT /api/admin/approve-user/:id
router.put('/approve-user/:id', checkAdmin, adminController.approveUser );

module.exports = router;
