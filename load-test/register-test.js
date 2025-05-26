import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 50, // 50 пользователей
  duration: '30s', // 30 секунд
};

function randomEmail() {
  return `user_${Math.random().toString(36).substring(2, 10)}@example.com`;
}

export default function () {
  const payload = JSON.stringify({
    first_name: 'Иван',
    last_name: 'Иванов',
    middle_name: 'Иванович',
    email: randomEmail(),
    password: 'password123',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post('http://localhost:3000/api/auth/register', payload, params);

  check(res, {
    'регистрация успешна': (r) => r.status === 201,
  });
}
