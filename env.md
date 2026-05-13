
## 環境變數管理（最佳實踐）

建立 `.env` 檔案

    env
    
    # 應用設定
    PORT=3000
    NODE_ENV=development
    # MongoDB
    MONGODB_URI=mongodb://localhost:27017/myapp
    # MySQL
    MYSQL_HOST=localhost
    MYSQL_PORT=3306
    MYSQL_USER=root
    MYSQL_PASSWORD=your_password
    MYSQL_DATABASE=myapp

安裝 dotenv：

    bash
    npm install dotenv

修改 `db.js`：

    javascript
    
    require('dotenv').config();
    
    const mongoose = require('mongoose');
    const connectDB = async () => {
	     const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/myapp';
	     await mongoose.connect(uri);
	     console.log('資料庫已連線');
    };
