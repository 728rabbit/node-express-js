// db.js - 建立資料庫連線
const mysql = require('mysql2/promise');
const QueryBuilder = require('./lib/QueryBuilder');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'myapp',
    waitForConnections: true,
    connectionLimit: 10
});

// 輔助函數：取得 QueryBuilder 實例
function table(tableName) {
    return new QueryBuilder(tableName, pool);
}

module.exports = { pool, table };
