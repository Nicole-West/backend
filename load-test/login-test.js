import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    // { duration: '30s', target: 10 },   // Низкая нагрузка
    // { duration: '30s', target: 30 },
    // { duration: '30s', target: 60 },
    // { duration: '30s', target: 100 },
    // { duration: '30s', target: 0 },    // Спад

    { duration: '20s', target: 10 },   // Низкая нагрузка
    { duration: '20s', target: 20 },
    { duration: '20s', target: 30 },
    { duration: '20s', target: 40 },
    { duration: '20s', target: 50 },
    { duration: '20s', target: 60 },
    { duration: '20s', target: 70 },
    { duration: '20s', target: 80 },
    { duration: '20s', target: 90 },
    { duration: '20s', target: 100 },   // Пиковая нагрузка
    { duration: '20s', target: 0 },    // Спад
  ],
};

// ⚠️ Убедись, что эти учетные данные существуют и одобрены в БД!
const testUser = {
  email: 'testuser@example.com',
  password: 'password123'
};

export default function () {
  const url = 'http://localhost:3000/api/auth/login';

  const payload = JSON.stringify(testUser);

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'логин успешен': (r) => r.status === 200 && r.json('token') !== undefined,
  });

  sleep(1); // Пауза между итерациями
}


// import http from 'k6/http';
// import { check, sleep } from 'k6';

// export let options = {
//   stages: [
//     { duration: '30s', target: 10 },
//   ],
// };

// const testUser = {
//   email: 'testuser@example.com',
//   password: 'password123'
// };

// export default function () {
//   const url = 'http://localhost:3000/api/auth/login';

//   const payload = JSON.stringify(testUser);
//   const params = { headers: { 'Content-Type': 'application/json' } };

//   const res = http.post(url, payload, params);

//   // 👇 Добавим вывод подробной информации
//   console.log(`Status: ${res.status}`);
//   console.log(`Body: ${res.body}`);

//   check(res, {
//     'логин успешен': (r) => r.status === 200 && r.json('token') !== undefined,
//   });

//   sleep(1);
// }
