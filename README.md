# 5 分鐘極速入門 Express

## 第 1 步：初始化項目

    bash
    mkdir my-api
    cd my-api
    npm init -y   // create json file
    npm install express

## 第 2 步：建立第一個伺服器

    javascript
    // index.js
    const express = require('express');
    const app = express();
    const port = 3000;
    
    app.get('/', (req, res) => {
     res.send('Hello World!');
    });
    
    app.listen(port, () => {
     console.log(`Server running at http://localhost:${port}`);
    });

## 第 3 步：運行

    bash
    node index.js
    開啟瀏覽器造訪 http://localhost:3000


# 5 分钟写一个简单的用户 API

    const express = require('express');
    const app = express();
    
    // 這個中間件讓你能拿到 POST 請求的 JSON 數據
    app.use(express.json());
    
    // 模擬資料庫（就是個陣列）
    let users = [
     { id: 1, name: 'Alice' },
     { id: 2, name: 'Bob' }
    ];
    
    // GET - 取得所有用戶
    app.get('/users', (req, res) => {
     res.json(users);
    });
    
    // GET - 取得單一使用者（路徑參數）
    app.get('/users/:id', (req, res) => {
     const user = users.find(u => u.id === parseInt(req.params.id));
     if (!user) return res.status(404).json({ error: 'User not found' });
     res.json(user);
    });
    
    // POST - 建立使用者（請求體）
    app.post('/users', (req, res) => {
     const newUser = {
     id: users.length + 1,
     name: req.body.name
     };
     users.push(newUser);
     res.status(201).json(newUser);
    });
    
    // DELETE - 刪除用戶
    app.delete('/users/:id', (req, res) => {
     const id = parseInt(req.params.id);
     users = users.filter(u => u.id !== id);
     res.json({ message: 'User deleted' });
    });
    
    app.listen(3000, () => console.log('API running on port 3000'));

### 测试你的 API

    curl http://localhost:3000/users
    
    curl http://localhost:3000/users/1
    
    curl -X POST http://localhost:3000/users \
     -H "Content-Type: application/json" \
     -d '{"name": "Charlie"}'
     
    curl -X DELETE http://localhost:3000/users/1


# 3 個新概念
1️⃣ 路徑參數 vs 查詢參數

    javascript
    // 路徑參數：/users/5
    app.get('/users/:id', (req, res) => {
     console.log(req.params.id); // 5
    });

    // 查詢參數：/users?page=2&limit=10
    app.get('/users', (req, res) => {
     console.log(req.query.page); // 2
     console.log(req.query.limit); // 10
    });

2️⃣ 請求體 (req.body)

    javascript
    app.use(express.json()); // 必須先加這行
    
    app.post('/data', (req, res) => {
     console.log(req.body); // POST 請求發送的 JSON
     res.json(req.body);
    });

3️⃣ 中介軟體 (就是函數)

    javascript
    // 在每個請求前執行
    app.use((req, res, next) => {
     console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
     next(); // 繼續往下走
    });


# 專案結構建議

    my-express-app/
    ├── .env
    ├── app.js
    ├── package.json
    ├── src/
    │   ├── config/
    │   │   ├── db.js          # 資料庫連線設定
    │   │   └── env.js         # 環境變數載入
    │   ├── models/
    │   │   ├── User.js        # MongoDB 模型
    │   │   └── index.js       # 模型匯出
    │   ├── controllers/
    │   │   └── userController.js
    │   ├── routes/
    │   │   └── userRoutes.js
    │   └── middleware/
    │       └── errorHandler.js
    └── tests/
