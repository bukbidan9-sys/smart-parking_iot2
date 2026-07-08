const mysql = require('mysql2');

const db = mysql.createPool({
  host: 'mysql-2b5c614d-bukbidan9-2fb4.f.aivencloud.com',
  user: 'avnadmin',
  password: 'AVNS_RFIjOz6SZxW9JI48KNK',
  database: 'defaultdb',
 port: 18131, 
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = db;