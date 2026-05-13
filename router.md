
## 路由模組化（Router）

隨著專案變大，把路由拆分到不同檔案：

    javascript
    
    // routes/users.js
    const express = require('express');
    const router = express.Router();
    
    // 模擬資料
    let users = [
     { id: 1, name: 'Alice', email: 'alice@example.com' },
     { id: 2, name: 'Bob', email: 'bob@example.com' }
    ];
    
    // 所有路由都是相對於 /users
    router.get('/', (req, res) => {
     res.json(users);
    });
    
    router.get('/:id', (req, res) => {
     const user = users.find(u => u.id === parseInt(req.params.id));
     if (!user) return res.status(404).json({ error: 'User not found' });
     res.json(user);
    });
    
    router.post('/', (req, res) => {
     const newUser = {
     id: users.length + 1,
     name: req.body.name,
     email: req.body.email
     };
     users.push(newUser);
     res.status(201).json(newUser);
    });
    
    router.put('/:id', (req, res) => {
     const id = parseInt(req.params.id);
     const index = users.findIndex(u => u.id === id);
      
     if (index === -1) return res.status(404).json({ error: 'User not found' });
      
     users[index] = { ...users[index], ...req.body };
     res.json(users[index]);
    });
    
    router.delete('/:id', (req, res) => {
     const id = parseInt(req.params.id);
     users = users.filter(u => u.id !== id);
     res.status(204).send();
    });
    module.exports = router;
    
  
  ## 使用路由模組  
    javascript
    
    // index.js - 使用路由模組
    const userRoutes = require('./routes/users');
    app.use('/api/users', userRoutes);
    // 現在可以訪問：
    // GET    /api/users
    // GET    /api/users/1
    // POST   /api/users
    // PUT    /api/users/1
    // DELETE /api/users/1
