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
function db_query(tableName) {
    return new QueryBuilder(tableName, pool);
}

async function db_row_query(sql, params = []) {
    const [rows] = await pool.query(sql, params);
    return rows;
}

async function db_transaction(callback) {
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { pool, db_query, db_row_query, db_transaction};
