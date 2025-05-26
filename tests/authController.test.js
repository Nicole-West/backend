const authController = require('../controllers/authController');
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Мокаем зависимости
jest.mock('../db');
jest.mock('bcrypt');
jest.mock('jsonwebtoken');

describe('authController', () => {
  let res, req;

  beforeEach(() => {
    jest.clearAllMocks();
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    req = {
      body: {}
    };
  });

  describe('register', () => {
    it('Если адрес электронно почту уже есть в базе данных', async () => {
      req.body = {
        email: 'example@example.com',
        first_name: 'Имя',
        last_name: 'Фамилия',
        middle_name: '',
        password: '1234'
      };
      db.query.mockResolvedValueOnce([[{ user_id: 1 }]]);

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Email уже зарегистрирован' });
    });

    it('Успешная регистрация нового пользователя', async () => {
      req.body = {
        email: 'example@example.com',
        first_name: 'Имя',
        last_name: 'Фамилия',
        middle_name: '',
        password: '1234'
      };
      db.query.mockResolvedValueOnce([[]]); // Нет такого email
      bcrypt.hash.mockResolvedValue('hashedPassword');
      db.query.mockResolvedValueOnce([{ insertId: 1 }]);

      await authController.register(req, res);

      expect(db.query).toHaveBeenCalledTimes(2);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: 'Регистрация успешна, ожидайте подтверждения от администратора' });
    });
  });

  describe('login', () => {
    it('Пользователь не найден', async () => {
      req.body = { email: 'example@example.com', password: '1234' };
      db.query.mockResolvedValueOnce([[]]);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Неверный email или пароль' });
    });

    it('Пользователь не подтвержден администратором', async () => {
      req.body = { email: 'example@example.com', password: '1234' };
      db.query.mockResolvedValueOnce([[{ is_approved: 0 }]]);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: 'Пользователь не подтвержден администратором' });
    });

    it('Неверный пароль', async () => {
      req.body = { email: 'example@example.com', password: 'wrongpass' };
      db.query.mockResolvedValueOnce([[{ is_approved: 1, password_hash: 'hashed' }]]);
      bcrypt.compare.mockResolvedValue(false);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'Неверный email или пароль' });
    });

    it('Успешный вход', async () => {
      req.body = { email: 'example@example.com', password: 'correct' };
      db.query.mockResolvedValueOnce([[{
        is_approved: 1,
        password_hash: 'hashed',
        user_id: 1,
        first_name: 'Имя',
        middle_name: 'Отчество',
        role: 'teacher'
      }]]);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('fake-jwt-token');

      await authController.login(req, res);

      expect(res.json).toHaveBeenCalledWith({ token: 'fake-jwt-token' });
    });
  });
});
