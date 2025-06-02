
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'bsmfi0igp7rbisdownaq-mysql.services.clever-cloud.com',
  port: 3306,
  user: 'ur7oz21mkjnslaht',
  password: 'nQew5jeK6lLE9x8pmr8L',
  database: 'bsmfi0igp7rbisdownaq',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// const pool = mysql.createPool({
//   host: 'localhost',
//   user: 'root',
//   password: '',
//   // database: 'Версия_8_5'
//   database: 'Университет'
// });

module.exports = pool;

// suvorova.tt@example.ru
// password1

// example19@example.com