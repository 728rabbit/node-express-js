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
