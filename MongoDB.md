
## 二、MongoDB + Mongoose（推薦入門）

### 2.1 安裝 MongoDB

    **選項 A：本機安裝**  
    前往 [MongoDB Community Server](https://www.mongodb.com/try/download/community) 下載安裝包[](https://www.cnblogs.com/jocelyn11/p/18493216)
    
    **選項 B：雲端服務（免安裝）**  
    註冊 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) 免費帳號，取得連線字串
    
    **選項 C：使用 Docker**
    
    bash
    
    docker run -d -p 27017:27017 --name mongodb mongo:5

### 2.2 安裝 Mongoose

    bash
    
    npm install mongoose

### 2.3 建立資料庫連線模組 (src/config/db.js)
    
    javascript
    
    const mongoose = require('mongoose');
    const connectDB = async () => {
     try {
     // 連線字串格式：mongodb://主機:埠/資料庫名稱
     const conn = await mongoose.connect('mongodb://localhost:27017/myapp', {
     useNewUrlParser: true,
     useUnifiedTopology: true,
     });
      
     console.log(`MongoDB 連線成功：${conn.connection.host}`);
     } catch (error) {
     console.error('MongoDB 連線失敗：', error.message);
     process.exit(1); // 連線失敗則結束程序
     }
    };
    module.exports = connectDB;

### 2.4 定義資料模型（Schema）(src/models/User.js)

    javascript
    
    const mongoose = require('mongoose');
    // 定義資料結構
    const userSchema = new mongoose.Schema({
     username: {
     type: String,
     required: [true, '請填寫使用者名稱'],
     unique: true,
     trim: true,
     minlength: [3, '名稱至少 3 個字元']
     },
     email: {
     type: String,
     required: [true, '請填寫 Email'],
     unique: true,
     lowercase: true,
     match: [/^\S+@\S+\.\S+$/, '請填寫有效的 Email']
     },
     password: {
     type: String,
     required: [true, '請填寫密碼'],
     minlength: [6, '密碼至少 6 個字元']
     },
     bio: {
     type: String,
     default: null
     },
     createdAt: {
     type: Date,
     default: Date.now
     }
    }, {
     timestamps: true // 自動產生 createdAt 和 updatedAt
    });
    // 建立模型（對應到 MongoDB 的 collection）
    module.exports = mongoose.model('User', userSchema);

### 2.5 在 Express 中使用

**主程式 `app.js`**：

    javascript
    
    const express = require('express');
    const connectDB = require('./src/config/db');
    const User = require('./src/models/User');
    const app = express();
    
    // 1. 連接資料庫（在所有請求之前）
    connectDB();
    
    // 2. 中間件
    app.use(express.json());
    
    // 3. 路由：建立使用者
    app.post('/api/users', async (req, res, next) => {
     try {
     const user = new User(req.body);
     await user.save();
     res.status(201).json({ success: true, data: user });
     } catch (error) {
     next(error);
     }
    });
    
    // 4. 路由：取得所有使用者
    app.get('/api/users', async (req, res, next) => {
     try {
     const users = await User.find().select('-password'); // 排除密碼
     res.json({ success: true, data: users });
     } catch (error) {
     next(error);
     }
    });
    
    // 5. 路由：取得單一使用者
    app.get('/api/users/:id', async (req, res, next) => {
     try {
     const user = await User.findById(req.params.id);
     if (!user) {
     return res.status(404).json({ success: false, message: '使用者不存在' });
     }
     res.json({ success: true, data: user });
     } catch (error) {
     next(error);
     }
    });
    
    // 6. 路由：更新使用者
    app.put('/api/users/:id', async (req, res, next) => {
     try {
     const user = await User.findByIdAndUpdate(
     req.params.id,
     req.body,
     { new: true, runValidators: true } // 回傳新資料、執行驗證
     );
     if (!user) {
     return res.status(404).json({ success: false, message: '使用者不存在' });
     }
     res.json({ success: true, data: user });
     } catch (error) {
     next(error);
     }
    });
    
    // 7. 路由：刪除使用者
    app.delete('/api/users/:id', async (req, res, next) => {
     try {
     const user = await User.findByIdAndDelete(req.params.id);
     if (!user) {
     return res.status(404).json({ success: false, message: '使用者不存在' });
     }
     res.status(204).send();
     } catch (error) {
     next(error);
     }
    });
    
    // 8. 錯誤處理中間件
    app.use((err, req, res, next) => {
     console.error(err);
      
     // Mongoose 重複鍵錯誤
     if (err.code === 11000) {
     return res.status(400).json({ success: false, message: '該欄位已有重複資料' });
     }
      
     // Mongoose 驗證錯誤
     if (err.name === 'ValidationError') {
     const messages = Object.values(err.errors).map(e => e.message);
     return res.status(400).json({ success: false, message: messages.join(', ') });
     }
      
     res.status(500).json({ success: false, message: '伺服器錯誤' });
    });
    
    const PORT = 3000;
    app.listen(PORT, () => {
     console.log(`伺服器運行於 http://localhost:${PORT}`);
    });
