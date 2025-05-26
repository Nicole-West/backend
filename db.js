
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  // database: 'Версия_8_5'
  database: 'Университет'
});

module.exports = pool;


// example1@example.com
// suvorova.tt@example.ru
// password1

// admin@example.com