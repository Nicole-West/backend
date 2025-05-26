const jwt = require('jsonwebtoken');

function checkAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) return res.status(401).json({ error: 'Нет токена' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, 'your_secret_key');
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

module.exports = checkAdmin;