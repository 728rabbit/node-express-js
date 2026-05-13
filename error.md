
# 錯誤處理

    // 1. 同步錯誤 - 用 try/catch
    app.get('/error-test', (req, res) => {
      try {
        throw new Error('Something went wrong');
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // 2. 非同步錯誤 - 包在 try/catch
    app.get('/async-error', async (req, res, next) => {
      try {
        // 模擬非同步操作
        const result = await someAsyncFunction();
        res.json(result);
      } catch (error) {
        next(error);  // 傳給錯誤處理中間件
      }
    });
    
    // 3. 404 處理（放在所有路由之後）
    app.use((req, res) => {
      res.status(404).json({ error: `Cannot ${req.method} ${req.url}` });
    });
    
    // 4. 全局錯誤處理中間件（放在最後）
    app.use((err, req, res, next) => {
      console.error(err.stack);
      
      const status = err.status || 500;
      const message = err.message || 'Internal Server Error';
      
      res.status(status).json({
        error: message,
        timestamp: new Date().toISOString(),
        path: req.path
      });
    });
    
    // 自定義錯誤類別
    class NotFoundError extends Error {
      constructor(message) {
        super(message);
        this.status = 404;
      }
    }
    
    // 使用
    app.get('/user/:id', (req, res, next) => {
      const user = findUser(req.params.id);
      if (!user) {
        next(new NotFoundError(`User ${req.params.id} not found`));
      }
      res.json(user);
    });
