
# 中間件 Middleware（核心概念）

中間件就是在請求到達路由之前或之後執行的函數。

    // 最簡單的中間件
    app.use((req, res, next) => {
    console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();  // 一定要呼叫 next()，否則請求會卡住
    });
    
    // 只對特定路徑生效
    app.use('/api', (req, res, next) => {
    console.log('This runs only for /api/* routes');
    next();
    });
    
    // 內建中間件
    app.use(express.json());      // 解析 JSON body
    app.use(express.urlencoded({ extended: true }));  // 解析表單資料
    app.use(express.static('public'));  // 靜態檔案服務
    
    // 第三方中間件（需要安裝）
    // npm install morgan cors helmet
    const morgan = require('morgan');
    const cors = require('cors');
    const helmet = require('helmet');
    
    app.use(morgan('dev'));   // 自動記錄請求日誌
    app.use(cors());          // 允許跨域
    app.use(helmet());        // 安全頭部
