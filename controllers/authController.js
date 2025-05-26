// authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');

exports.register = async (req, res) => {
  console.log('[POST] /api/auth/register');
  console.log('Регистрация:', req.body.email);

  const { first_name, last_name, middle_name, email, password } = req.body;

  const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  if (existing.length > 0) return res.status(400).json({ message: 'Email уже зарегистрирован' });

  const hash = await bcrypt.hash(password, 10);

  await db.query(`
    INSERT INTO users (first_name, last_name, middle_name, email, password_hash, role, is_approved)
    VALUES (?, ?, ?, ?, ?, 'teacher', FALSE);
  `, [first_name, last_name, middle_name, email, hash]);

  res.status(201).json({ message: 'Регистрация успешна, ожидайте подтверждения от администратора' });
};

exports.login = async (req, res) => {
  console.log('[POST] /api/auth/login');
  console.log('Попытка входа:', req.body.email);

  const { email, password } = req.body;
  const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

  if (!users.length) return res.status(400).json({ message: 'Неверный email или пароль' });

  const user = users[0];
  if (!user.is_approved) return res.status(403).json({ message: 'Пользователь не подтвержден администратором' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(400).json({ message: 'Неверный email или пароль' });

  const token = jwt.sign(
    {
      user_id: user.user_id,
      name: `${user.first_name} ${user.middle_name || ''}`.trim(),
      role: user.role
    },
    'your_secret_key',
    { expiresIn: '1d' }
  );

  res.json({ token });
};
