
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

## 自定義中間件實例

    // 1. 認證中間件
    const authMiddleware = (req, res, next) => {
      const token = req.headers.authorization;
      
      if (!token || token !== 'secret-token-123') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      req.user = { id: 1, name: 'John' };  // 附加用戶資訊
      next();
    };
    
    // 需要登入的路由
    app.get('/profile', authMiddleware, (req, res) => {
      res.json({ message: 'Your profile', user: req.user });
    });
    
    // 2. 請求速度限制
    const rateLimit = (maxRequests, windowMs) => {
      const requests = new Map();
      
      return (req, res, next) => {
        const ip = req.ip;
        const now = Date.now();
        
        if (!requests.has(ip)) {
          requests.set(ip, []);
        }
        
        const timestamps = requests.get(ip).filter(t => now - t < windowMs);
        timestamps.push(now);
        requests.set(ip, timestamps);
        
        if (timestamps.length > maxRequests) {
          return res.status(429).json({ error: 'Too many requests' });
        }
        
        next();
      };
    };
    
    app.get('/limited', rateLimit(5, 60000), (req, res) => {
      res.json({ message: 'You can only call this 5 times per minute' });
    });
    
    // 3. 記錄響應時間
    app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.path} took ${duration}ms`);
      });
      next();
    });
