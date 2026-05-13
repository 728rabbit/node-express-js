# JWT 會員認證

    // 完成的 API 大概長這樣
    POST   /api/auth/register     // 註冊
    POST   /api/auth/login        // 登入（取得 token）
    POST   /api/auth/logout       // 登出
    GET    /api/auth/me           // 取得個人資料（需要 token）
    PUT    /api/auth/profile      // 更新個人資料
    POST   /api/auth/refresh      // 刷新 token
    POST   /api/auth/forgot-password  // 忘記密碼
    POST   /api/auth/reset-password   // 重設密碼
    
    // 需要登入的路由
    GET    /api/users             // 需要 token
    GET    /api/admin/dashboard   // 需要 admin 權限

## 1. 系統架構

    ┌─────────────────────────────────────────────────────────┐
    │                    前端 (React/Vue/App)                  │
    └─────────────────────────────────────────────────────────┘
                                  │
                                  │ 發送請求 + JWT Token
                                  ▼
    ┌─────────────────────────────────────────────────────────┐
    │                    Express Middleware                    │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │
    │  │  rateLimit  │→│  bodyParser │→│   cors      │      │
    │  └─────────────┘  └─────────────┘  └─────────────┘      │
    │                              │                           │
    │                              ▼                           │
    │  ┌─────────────────────────────────────────────────┐    │
    │  │           authMiddleware (驗證 JWT)              │    │
    │  └─────────────────────────────────────────────────┘    │
    │                              │                           │
    │              ┌───────────────┼───────────────┐           │
    │              ▼               ▼               ▼           │
    │         /auth/*         /api/*          /admin/*         │
    │         (不用登入)      (需要登入)       (需要 admin)      │
    └─────────────────────────────────────────────────────────┘
                                  │
                                  ▼
    ┌─────────────────────────────────────────────────────────┐
    │                      MySQL 資料庫                        │
    │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
    │  │    users     │  │   sessions   │  │  password_   │   │
    │  │              │  │              │  │   resets     │   │
    │  └──────────────┘  └──────────────┘  └──────────────┘   │
    └─────────────────────────────────────────────────────────┘

## 2.安裝套件

    bash
    
    npm install express mysql2
    npm install jsonwebtoken bcrypt
    npm install dotenv express-rate-limit
    npm install cookie-parser
    npm install nodemailer  # 發送忘記密碼郵件（選用）

----------

## 3.資料庫設計

    sql
    
    -- 建立資料庫
    CREATE DATABASE IF NOT EXISTS auth_demo;
    USE auth_demo;
    -- 1. 使用者資料表
    CREATE TABLE `users` (
     `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
     `uuid` CHAR(36) NOT NULL DEFAULT (UUID()),
     `username` VARCHAR(50) NOT NULL,
     `email` VARCHAR(100) NOT NULL,
     `password_hash` VARCHAR(255) NOT NULL,
     `role` ENUM('user', 'admin', 'moderator') DEFAULT 'user',
     `avatar` VARCHAR(500) DEFAULT NULL,
     `is_active` TINYINT(1) DEFAULT 1,
     `email_verified_at` DATETIME DEFAULT NULL,
     `last_login_at` DATETIME DEFAULT NULL,
     `last_login_ip` VARCHAR(45) DEFAULT NULL,
     `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
     `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     PRIMARY KEY (`id`),
     UNIQUE KEY `uk_email` (`email`),
     UNIQUE KEY `uk_username` (`username`),
     UNIQUE KEY `uk_uuid` (`uuid`),
     INDEX `idx_role` (`role`),
     INDEX `idx_is_active` (`is_active`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    -- 2. Refresh Token 儲存表（用於登出和自動延長）
    CREATE TABLE `refresh_tokens` (
     `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
     `user_id` INT UNSIGNED NOT NULL,
     `token` VARCHAR(500) NOT NULL,
     `expires_at` DATETIME NOT NULL,
     `revoked` TINYINT(1) DEFAULT 0,
     `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (`id`),
     INDEX `idx_user_id` (`user_id`),
     INDEX `idx_token` (`token`(255)),
     INDEX `idx_expires_at` (`expires_at`),
     FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    -- 3. 密碼重設記錄表
    CREATE TABLE `password_resets` (
     `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
     `email` VARCHAR(100) NOT NULL,
     `token` VARCHAR(255) NOT NULL,
     `expires_at` DATETIME NOT NULL,
     `used` TINYINT(1) DEFAULT 0,
     `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (`id`),
     INDEX `idx_email` (`email`),
     INDEX `idx_token` (`token`),
     INDEX `idx_expires_at` (`expires_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    -- 4. 登入日誌（選用，用於安全審計）
    CREATE TABLE `login_logs` (
     `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
     `user_id` INT UNSIGNED DEFAULT NULL,
     `email` VARCHAR(100) NOT NULL,
     `ip_address` VARCHAR(45) NOT NULL,
     `user_agent` TEXT,
     `success` TINYINT(1) DEFAULT 0,
     `failure_reason` VARCHAR(255) DEFAULT NULL,
     `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (`id`),
     INDEX `idx_email` (`email`),
     INDEX `idx_user_id` (`user_id`),
     INDEX `idx_created_at` (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

----------

## 4. 環境變數設定

    env
    
    # .env
    PORT=3000
    NODE_ENV=development
    # 資料庫
    DB_HOST=localhost
    DB_USER=root
    DB_PASSWORD=your_password
    DB_NAME=auth_demo
    # JWT
    JWT_SECRET=your-super-secret-key-change-this-in-production
    JWT_ACCESS_EXPIRES_IN=15m        # Access Token 有效期 15 分鐘
    JWT_REFRESH_EXPIRES_IN=7d        # Refresh Token 有效期 7 天
    # Cookie
    COOKIE_SECRET=your-cookie-secret
    # Email (選用，用於忘記密碼)
    SMTP_HOST=smtp.gmail.com
    SMTP_PORT=587
    SMTP_USER=your-email@gmail.com
    SMTP_PASS=your-app-password


### JWT 工具函數

    // utils/jwt.js
    const jwt = require('jsonwebtoken');
    
    const JWT_SECRET = process.env.JWT_SECRET;
    const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
    const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
    
    // 產生 Access Token（短效，放在 Authorization Header）
    function generateAccessToken(payload) {
        return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
    }
    
    // 產生 Refresh Token（長效，存在資料庫）
    function generateRefreshToken() {
        return jwt.sign(
            { type: 'refresh', random: Math.random().toString(36) },
            JWT_SECRET,
            { expiresIn: REFRESH_EXPIRES }
        );
    }
    
    // 驗證 Token
    function verifyToken(token) {
        try {
            return { valid: true, decoded: jwt.verify(token, JWT_SECRET) };
        } catch (error) {
            let message = 'Invalid token';
            if (error.name === 'TokenExpiredError') message = 'Token expired';
            if (error.name === 'JsonWebTokenError') message = 'Invalid token';
            return { valid: false, error: message };
        }
    }
    
    // 解析 Token（不驗證過期）
    function decodeToken(token) {
        return jwt.decode(token);
    }
    
    module.exports = {
        generateAccessToken,
        generateRefreshToken,
        verifyToken,
        decodeToken
    };

### 密碼加密工具

    // utils/password.js
    const bcrypt = require('bcrypt');
    
    const SALT_ROUNDS = 10;
    
    async function hashPassword(password) {
        return await bcrypt.hash(password, SALT_ROUNDS);
    }
    
    async function verifyPassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }
    
    module.exports = { hashPassword, verifyPassword };

### 驗證 Middleware

    // middleware/auth.js
    const { verifyToken } = require('../utils/jwt');
    const { table } = require('../config/database');
    
    // 驗證 JWT Token
    async function authMiddleware(req, res, next) {
        // 1. 從 Header 拿 Token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: '未提供授權憑證'
            });
        }
    
        const token = authHeader.substring(7);
        
        // 2. 驗證 Token
        const result = verifyToken(token);
        if (!result.valid) {
            return res.status(401).json({
                success: false,
                message: result.error
            });
        }
        
        // 3. 檢查使用者是否存在且啟用
        const user = await table('users')
            .select('id', 'uuid', 'username', 'email', 'role', 'is_active')
            .where('id', result.decoded.userId)
            .first();
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: '使用者不存在'
            });
        }
        
        if (!user.is_active) {
            return res.status(403).json({
                success: false,
                message: '帳號已被停用'
            });
        }
        
        // 4. 把使用者資訊掛到 req 上
        req.user = user;
        next();
    }
    
    // 權限檢查（角色）
    function roleMiddleware(allowedRoles = []) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ success: false, message: '未授權' });
            }
            
            if (allowedRoles.length && !allowedRoles.includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    message: `需要權限：${allowedRoles.join(' 或 ')}`
                });
            }
            
            next();
        };
    }
    
    // 可選的驗證（有 token 就解析，沒有也可以）
    async function optionalAuthMiddleware(req, res, next) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const result = verifyToken(token);
            if (result.valid) {
                const user = await table('users')
                    .where('id', result.decoded.userId)
                    .where('is_active', 1)
                    .first();
                if (user) req.user = user;
            }
        }
        next();
    }
    
    module.exports = { authMiddleware, roleMiddleware, optionalAuthMiddleware };

### 請求驗證（Validation）

    // middleware/validate.js
    // 簡單的請求驗證，不用第三方套件
    
    function validateRegister(req, res, next) {
        const { username, email, password } = req.body;
        const errors = [];
        
        if (!username || username.length < 3) {
            errors.push('使用者名稱至少需要 3 個字元');
        }
        
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            errors.push('請提供有效的 Email');
        }
        
        if (!password || password.length < 6) {
            errors.push('密碼至少需要 6 個字元');
        }
        
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }
        
        next();
    }
    
    function validateLogin(req, res, next) {
        const { email, password } = req.body;
        const errors = [];
        
        if (!email) errors.push('請輸入 Email');
        if (!password) errors.push('請輸入密碼');
        
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }
        
        next();
    }
    
    module.exports = { validateRegister, validateLogin };

### 主要認證邏輯

    // controllers/authController.js
    const { table, transaction } = require('../config/database');
    const { hashPassword, verifyPassword } = require('../utils/password');
    const { generateAccessToken, generateRefreshToken, verifyToken } = require('../utils/jwt');
    const crypto = require('crypto');
    
    // 註冊
    async function register(req, res, next) {
        const { username, email, password } = req.body;
        
        try {
            // 檢查是否已存在
            const existingUser = await table('users')
                .where('email', email)
                .orWhere('username', username)
                .first();
            
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: '使用者名稱或 Email 已被註冊'
                });
            }
            
            // 建立使用者
            const passwordHash = await hashPassword(password);
            const userId = await table('users').insertGetId({
                username,
                email,
                password_hash: passwordHash,
                role: 'user',
                is_active: 1
            });
            
            // 取得使用者資料
            const user = await table('users')
                .select('id', 'uuid', 'username', 'email', 'role', 'created_at')
                .where('id', userId)
                .first();
            
            // 產生 Token
            const accessToken = generateAccessToken({ userId: user.id, role: user.role });
            const refreshToken = generateRefreshToken();
            
            // 儲存 Refresh Token
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);
            
            await table('refresh_tokens').insert({
                user_id: user.id,
                token: refreshToken,
                expires_at: expiresAt
            });
            
            res.status(201).json({
                success: true,
                message: '註冊成功',
                data: { user, accessToken, refreshToken }
            });
            
        } catch (error) {
            next(error);
        }
    }
    
    // 登入
    async function login(req, res, next) {
        const { email, password } = req.body;
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];
        
        try {
            // 查詢使用者
            const user = await table('users')
                .where('email', email)
                .first();
            
            if (!user) {
                // 記錄失敗登入
                await table('login_logs').insert({
                    email,
                    ip_address: ip,
                    user_agent: userAgent,
                    success: 0,
                    failure_reason: '帳號不存在'
                });
                
                return res.status(401).json({
                    success: false,
                    message: 'Email 或密碼錯誤'
                });
            }
            
            // 檢查密碼
            const isValid = await verifyPassword(password, user.password_hash);
            if (!isValid) {
                await table('login_logs').insert({
                    email,
                    ip_address: ip,
                    user_agent: userAgent,
                    success: 0,
                    failure_reason: '密碼錯誤'
                });
                
                return res.status(401).json({
                    success: false,
                    message: 'Email 或密碼錯誤'
                });
            }
            
            // 檢查帳號是否啟用
            if (!user.is_active) {
                return res.status(403).json({
                    success: false,
                    message: '帳號已被停用，請聯繫管理員'
                });
            }
            
            // 更新最後登入時間和 IP
            await table('users')
                .where('id', user.id)
                .update({
                    last_login_at: new Date(),
                    last_login_ip: ip
                });
            
            // 記錄成功登入
            await table('login_logs').insert({
                user_id: user.id,
                email,
                ip_address: ip,
                user_agent: userAgent,
                success: 1
            });
            
            // 產生 Token
            const accessToken = generateAccessToken({ userId: user.id, role: user.role });
            const refreshToken = generateRefreshToken();
            
            // 儲存 Refresh Token（先刪除舊的）
            await table('refresh_tokens')
                .where('user_id', user.id)
                .where('revoked', 0)
                .update({ revoked: 1 });
            
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 7);
            
            await table('refresh_tokens').insert({
                user_id: user.id,
                token: refreshToken,
                expires_at: expiresAt
            });
            
            // 回傳使用者資料（不包含密碼）
            const { password_hash, ...userWithoutPassword } = user;
            
            res.json({
                success: true,
                message: '登入成功',
                data: {
                    user: userWithoutPassword,
                    accessToken,
                    refreshToken
                }
            });
            
        } catch (error) {
            next(error);
        }
    }
    
    // 刷新 Token
    async function refreshToken(req, res, next) {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: '請提供 Refresh Token'
            });
        }
        
        try {
            // 驗證 Refresh Token
            const result = verifyToken(refreshToken);
            if (!result.valid) {
                return res.status(401).json({
                    success: false,
                    message: 'Refresh Token 無效或已過期'
                });
            }
            
            // 檢查資料庫中的 Token
            const tokenRecord = await table('refresh_tokens')
                .where('token', refreshToken)
                .where('revoked', 0)
                .where('expires_at', '>', new Date())
                .first();
            
            if (!tokenRecord) {
                return res.status(401).json({
                    success: false,
                    message: 'Refresh Token 無效或已失效'
                });
            }
            
            // 取得使用者資料
            const user = await table('users')
                .where('id', tokenRecord.user_id)
                .where('is_active', 1)
                .first();
            
            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: '使用者不存在或已被停用'
                });
            }
            
            // 產生新的 Access Token
            const newAccessToken = generateAccessToken({ userId: user.id, role: user.role });
            
            res.json({
                success: true,
                data: { accessToken: newAccessToken }
            });
            
        } catch (error) {
            next(error);
        }
    }
    
    // 登出
    async function logout(req, res, next) {
        const { refreshToken } = req.body;
        const userId = req.user.id;
        
        try {
            if (refreshToken) {
                // 撤銷 Refresh Token
                await table('refresh_tokens')
                    .where('token', refreshToken)
                    .update({ revoked: 1 });
            } else {
                // 撤銷該使用者的所有 Refresh Token
                await table('refresh_tokens')
                    .where('user_id', userId)
                    .where('revoked', 0)
                    .update({ revoked: 1 });
            }
            
            res.json({
                success: true,
                message: '登出成功'
            });
            
        } catch (error) {
            next(error);
        }
    }
    
    // 取得個人資料
    async function getProfile(req, res, next) {
        try {
            const user = await table('users')
                .select('id', 'uuid', 'username', 'email', 'role', 'avatar', 'created_at', 'last_login_at')
                .where('id', req.user.id)
                .first();
            
            res.json({
                success: true,
                data: { user }
            });
            
        } catch (error) {
            next(error);
        }
    }
    
    // 更新個人資料
    async function updateProfile(req, res, next) {
        const { username, avatar } = req.body;
        const updates = {};
        
        if (username) updates.username = username;
        if (avatar) updates.avatar = avatar;
        
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: '沒有提供任何更新資料'
            });
        }
        
        try {
            // 檢查 username 是否被其他人使用
            if (username) {
                const existing = await table('users')
                    .where('username', username)
                    .where('id', '!=', req.user.id)
                    .first();
                
                if (existing) {
                    return res.status(409).json({
                        success: false,
                        message: '使用者名稱已被使用'
                    });
                }
            }
            
            await table('users')
                .where('id', req.user.id)
                .update(updates);
            
            const updatedUser = await table('users')
                .select('id', 'uuid', 'username', 'email', 'role', 'avatar')
                .where('id', req.user.id)
                .first();
            
            res.json({
                success: true,
                message: '更新成功',
                data: { user: updatedUser }
            });
            
        } catch (error) {
            next(error);
        }
    }
    
    // 修改密碼
    async function changePassword(req, res, next) {
        const { oldPassword, newPassword } = req.body;
        
        if (!oldPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: '請提供舊密碼和新密碼'
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: '新密碼至少需要 6 個字元'
            });
        }
        
        try {
            const user = await table('users')
                .where('id', req.user.id)
                .first();
            
            const isValid = await verifyPassword(oldPassword, user.password_hash);
            if (!isValid) {
                return res.status(401).json({
                    success: false,
                    message: '舊密碼錯誤'
                });
            }
            
            const newPasswordHash = await hashPassword(newPassword);
            await table('users')
                .where('id', req.user.id)
                .update({ password_hash: newPasswordHash });
            
            // 登出所有其他裝置（撤銷所有 Refresh Token）
            await table('refresh_tokens')
                .where('user_id', req.user.id)
                .where('revoked', 0)
                .update({ revoked: 1 });
            
            res.json({
                success: true,
                message: '密碼修改成功，請重新登入'
            });
            
        } catch (error) {
            next(error);
        }
    }
    
    // 忘記密碼（產生重設 Token）
    async function forgotPassword(req, res, next) {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: '請提供 Email'
            });
        }
        
        try {
            const user = await table('users')
                .where('email', email)
                .first();
            
            // 即使使用者不存在也回傳成功（安全性考量）
            if (!user) {
                return res.json({
                    success: true,
                    message: '如果此 Email 存在於系統中，我們已發送密碼重設信件'
                });
            }
            
            // 產生重設 Token
            const resetToken = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 1); // 1 小時有效
            
            // 刪除舊的
            await table('password_resets')
                .where('email', email)
                .delete();
            
            await table('password_resets').insert({
                email,
                token: resetToken,
                expires_at: expiresAt
            });
            
            // TODO: 發送 Email
            // 這裡可以整合 nodemailer 寄送重設連結
            const resetLink = `http://localhost:3000/reset-password?token=${resetToken}`;
            console.log(`重設連結：${resetLink}`);
            
            res.json({
                success: true,
                message: '如果此 Email 存在於系統中，我們已發送密碼重設信件'
            });
            
        } catch (error) {
            next(error);
        }
    }
    
    // 重設密碼
    async function resetPassword(req, res, next) {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                message: '請提供 Token 和新密碼'
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: '密碼至少需要 6 個字元'
            });
        }
        
        try {
            const resetRecord = await table('password_resets')
                .where('token', token)
                .where('used', 0)
                .where('expires_at', '>', new Date())
                .first();
            
            if (!resetRecord) {
                return res.status(400).json({
                    success: false,
                    message: '重設連結無效或已過期'
                });
            }
            
            const newPasswordHash = await hashPassword(newPassword);
            await table('users')
                .where('email', resetRecord.email)
                .update({ password_hash: newPasswordHash });
            
            // 標記 Token 為已使用
            await table('password_resets')
                .where('id', resetRecord.id)
                .update({ used: 1 });
            
            // 登出該使用者的所有裝置
            const user = await table('users')
                .where('email', resetRecord.email)
                .first();
            
            if (user) {
                await table('refresh_tokens')
                    .where('user_id', user.id)
                    .update({ revoked: 1 });
            }
            
            res.json({
                success: true,
                message: '密碼重設成功，請使用新密碼登入'
            });
            
        } catch (error) {
            next(error);
        }
    }
    
    module.exports = {
        register,
        login,
        refreshToken,
        logout,
        getProfile,
        updateProfile,
        changePassword,
        forgotPassword,
        resetPassword
    };

### 路由設定

    // routes/authRoutes.js
    const express = require('express');
    const router = express.Router();
    
    const {
        register,
        login,
        refreshToken,
        logout,
        getProfile,
        updateProfile,
        changePassword,
        forgotPassword,
        resetPassword
    } = require('../controllers/authController');
    
    const { authMiddleware, roleMiddleware } = require('../middleware/auth');
    const { validateRegister, validateLogin } = require('../middleware/validate');
    
    // 公開路由
    router.post('/register', validateRegister, register);
    router.post('/login', validateLogin, login);
    router.post('/refresh', refreshToken);
    router.post('/forgot-password', forgotPassword);
    router.post('/reset-password', resetPassword);
    
    // 需要登入的路由
    router.post('/logout', authMiddleware, logout);
    router.get('/me', authMiddleware, getProfile);
    router.put('/profile', authMiddleware, updateProfile);
    router.post('/change-password', authMiddleware, changePassword);
    
    // 需要管理員權限的路由（範例）
    router.get('/admin-only', 
        authMiddleware, 
        roleMiddleware(['admin']), 
        (req, res) => {
            res.json({ success: true, message: '歡迎管理員！' });
        }
    );
    
    module.exports = router;

### 主程式入口

    // app.js
    require('dotenv').config();
    const express = require('express');
    const cookieParser = require('cookie-parser');
    const cors = require('cors');
    const rateLimit = require('express-rate-limit');
    
    const authRoutes = require('./routes/authRoutes');
    
    const app = express();
    
    // 全域 Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser(process.env.COOKIE_SECRET));
    app.use(cors({
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
        credentials: true
    }));
    
    // 限流（防止暴力破解）
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 分鐘
        max: 100, // 最多 100 次請求
        message: { success: false, message: '請求過於頻繁，請稍後再試' }
    });
    app.use('/api/auth', limiter);
    
    // 路由
    app.use('/api/auth', authRoutes);
    
    // 健康檢查
    app.get('/health', (req, res) => {
        res.json({ status: 'OK', timestamp: new Date() });
    });
    
    // 404 處理
    app.use((req, res) => {
        res.status(404).json({ success: false, message: '路由不存在' });
    });
    
    // 全域錯誤處理
    app.use((err, req, res, next) => {
        console.error('Error:', err);
        
        const status = err.status || 500;
        const message = err.message || '伺服器內部錯誤';
        
        res.status(status).json({
            success: false,
            message,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        });
    });
    
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`📝 API 文件：http://localhost:${PORT}/api/auth`);
    });
    
## API 測試

    # 1. 註冊
    curl -X POST http://localhost:3000/api/auth/register \
      -H "Content-Type: application/json" \
      -d '{"username":"john","email":"john@example.com","password":"123456"}'
    
    # 2. 登入
    curl -X POST http://localhost:3000/api/auth/login \
      -H "Content-Type: application/json" \
      -d '{"email":"john@example.com","password":"123456"}'
    
    # 3. 取得個人資料（需要 token）
    curl -X GET http://localhost:3000/api/auth/me \
      -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
    
    # 4. 更新個人資料
    curl -X PUT http://localhost:3000/api/auth/profile \
      -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"username":"john_updated"}'
    
    # 5. 修改密碼
    curl -X POST http://localhost:3000/api/auth/change-password \
      -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"oldPassword":"123456","newPassword":"654321"}'
    
    # 6. 刷新 Token
    curl -X POST http://localhost:3000/api/auth/refresh \
      -H "Content-Type: application/json" \
      -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
    
    # 7. 登出
    curl -X POST http://localhost:3000/api/auth/logout \
      -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'


## 前端串接範例

    // frontend/api.js
    const API_URL = 'http://localhost:3000/api';
    
    class AuthAPI {
        // 儲存 token
        static setTokens(accessToken, refreshToken) {
            localStorage.setItem('accessToken', accessToken);
            localStorage.setItem('refreshToken', refreshToken);
        }
        
        // 取得 token
        static getAccessToken() {
            return localStorage.getItem('accessToken');
        }
        
        // 清除 token
        static clearTokens() {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('refreshToken');
        }
        
        // 發送請求（自動處理 token 過期）
        static async request(endpoint, options = {}) {
            const token = this.getAccessToken();
            
            const response = await fetch(`${API_URL}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': `Bearer ${token}` }),
                    ...options.headers
                }
            });
            
            // Token 過期，嘗試刷新
            if (response.status === 401) {
                const refreshToken = localStorage.getItem('refreshToken');
                if (refreshToken) {
                    const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken })
                    });
                    
                    if (refreshResponse.ok) {
                        const { data } = await refreshResponse.json();
                        this.setTokens(data.accessToken, refreshToken);
                        // 重試原始請求
                        return this.request(endpoint, options);
                    }
                }
                this.clearTokens();
                window.location.href = '/login';
            }
            
            return response;
        }
        
        // 登入
        static async login(email, password) {
            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            const result = await response.json();
            if (result.success) {
                this.setTokens(result.data.accessToken, result.data.refreshToken);
            }
            return result;
        }
        
        // 登出
        static async logout() {
            const refreshToken = localStorage.getItem('refreshToken');
            await this.request('/auth/logout', {
                method: 'POST',
                body: JSON.stringify({ refreshToken })
            });
            this.clearTokens();
        }
        
        // 取得個人資料
        static async getProfile() {
            const response = await this.request('/auth/me');
            return response.json();
        }
    }
