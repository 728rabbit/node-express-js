
### 3.1 安裝 MySQL 套件

    bash 
    npm install mysql2

> 使用 `mysql2` 而非 `mysql`，因為它支援 Promise，可以用 async/await。

### 3.2 建立連線池 (src/config/mysql.js)

    javascript
    
    const mysql = require('mysql2');
    
    // 建立連線池（推薦使用，管理多個連線）
    const pool = mysql.createPool({
	     host: process.env.DB_HOST || 'localhost',
	     user: process.env.DB_USER || 'root',
	     password: process.env.DB_PASSWORD || '',
	     database: process.env.DB_NAME || 'myapp',
	     waitForConnections: true,
	     connectionLimit: 10,
	     queueLimit: 0
    });
    
    // 包裝成 Promise 版本
    const promisePool = pool.promise();
    module.exports = promisePool;

### 3.3 初始化資料表

    -- 執行這個 SQL 建立 users 表
    CREATE TABLE `users` (
	     `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
	     `username` varchar(50) NOT NULL,
	     `email` varchar(100) NOT NULL,
	     `bio` text DEFAULT NULL,
	     `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
	     PRIMARY KEY (`id`),
	     UNIQUE KEY `uk_email` (`email`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

### 3.4 在 Express 中使用

    javascript
    
    const express = require('express');
    const db = require('./src/config/mysql');
    const app = express();
    
    app.use(express.json());
    
    // GET：查詢所有使用者
    app.get('/api/users', async (req, res, next) => {
	     try {
		     const [rows] = await db.query('SELECT id, username, email, bio FROM users');
		     res.json({ success: true, data: rows });
	     } catch (error) {
		     next(error);
	     }
    });
    
    // GET：查詢單一使用者（使用參數化查詢防止 SQL Injection）
    app.get('/api/users/:id', async (req, res, next) => {
     try {
	     const [rows] = await db.query(
		     'SELECT id, username, email, bio FROM users WHERE id = ?',
		     [req.params.id]
	     );
      
	     if (rows.length === 0) {
		     return res.status(404).json({ success: false, message: '使用者不存在' });
	     }
      
	     res.json({ success: true, data: rows[0] });
     } catch (error) {
	     next(error);
     }
    });
    
    // POST：新增使用者
    app.post('/api/users', async (req, res, next) => {
	     const { username, email, bio } = req.body;
	      
	     try {
		     const [result] = await db.query(
			     'INSERT INTO users (username, email, bio) VALUES (?, ?, ?)',
			     [username, email, bio || null]
		     );
	      
		     res.status(201).json({
			     success: true,
			     data: { id: result.insertId, username, email, bio }
		     });
	     } catch (error) {
	     
		     // MySQL 重複鍵錯誤 (ER_DUP_ENTRY)
		     if (error.code === 'ER_DUP_ENTRY') {
			     return res.status(400).json({ success: false, message: 'Email 已經被註冊' });
		     }
		     next(error);
	     }
	    });
	    
	    // PUT：更新使用者
	    app.put('/api/users/:id', async (req, res, next) => {
	     const { username, email, bio } = req.body;
	      
	     try {
		     const [result] = await db.query(
			     'UPDATE users SET username = ?, email = ?, bio = ? WHERE id = ?',
			     [username, email, bio || null, req.params.id]
		     );
		      
		     if (result.affectedRows === 0) {
			     return res.status(404).json({ success: false, message: '使用者不存在' });
		     }
		      
		     res.json({ success: true, message: '更新成功' });
	     } catch (error) {
		     next(error);
	     }
    });
    
    // DELETE：刪除使用者
    app.delete('/api/users/:id', async (req, res, next) => {
     try {
	     const [result] = await db.query('DELETE FROM users WHERE id = ?', [req.params.id]);
      
	     if (result.affectedRows === 0) {
		     return res.status(404).json({ success: false, message: '使用者不存在' });
	     }
      
	     res.status(204).send();
     } catch (error) {
	     next(error);
     }
    });
    
    app.listen(3000);
