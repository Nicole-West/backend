import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 10 },   // Начинаем с 10 VUs
    { duration: '30s', target: 20 },   // Увеличиваем до 20
    { duration: '30s', target: 30 },   // До 30
    { duration: '30s', target: 40 },   // До 40
    { duration: '30s', target: 50 },   // До 50
    { duration: '30s', target: 60 },   // До 60 (высокая нагрузка)
    { duration: '30s', target: 0 },    // Плавный спад
  ],
};

function randomEmail() {
  return `user${Math.floor(Math.random() * 1e9)}@test.com`;
}

export default function () {
  const url = 'http://localhost:3000/api/auth/register';

  const payload = JSON.stringify({
    first_name: 'Load',
    last_name: 'Test',
    middle_name: 'User',
    email: randomEmail(),
    password: '123456',
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'регистрация успешна': (r) => r.status === 201 || r.status === 400,
  });

  sleep(1); // немного отдыха между регистрациями
}
