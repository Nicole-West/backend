const db = require('../db');

exports.getUnapprovedUsers = async (req, res) => {
    console.log(`[GET] /api/admin/unapproved-users`);
    try {
        const [users] = await db.query(`
            SELECT user_id, first_name, last_name, middle_name, email, role
            FROM users
            WHERE is_approved = false
        `);

        res.json({ users });
    } catch (err) {
        console.error('Ошибка получения неподтверждённых пользователей:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};

exports.approveUser = async (req, res) => {
    const userId = req.params.id;
    const { first_name, last_name, middle_name, email, role } = req.body;

    try {
        await db.query(`
            UPDATE users
            SET first_name = ?, last_name = ?, middle_name = ?, email = ?, role = ?, is_approved = true
            WHERE user_id = ?
        `, [first_name, last_name, middle_name, email, role, userId]);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка подтверждения пользователя:', err);
        res.status(500).json({ error: 'Ошибка при подтверждении' });
    }
};