const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Нет токена. Доступ запрещён.' });
  }

  const SECRET_KEY = 'your_secret_key';

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      console.error('[JWT VERIFY ERROR]', err);
      return res.status(403).json({ message: 'Неверный токен.' });
    }

    console.log('[AUTH OK] Пользователь ID:', user.user_id);
    req.user = user;
    next();
  });
};

module.exports = authMiddleware;

// auth.js