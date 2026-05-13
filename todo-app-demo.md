# 待辦事項 API

    javascript
    
    // todo-app.js
    const express = require('express');
    const app = express();
    app.use(express.json());
    let todos = [
     { id: 1, title: 'Learn Express', completed: false },
     { id: 2, title: 'Build an API', completed: false }
    ];
    // 獲取所有待辦
    app.get('/todos', (req, res) => {
     const { completed } = req.query;
      
     if (completed !== undefined) {
     const isCompleted = completed === 'true';
     const filtered = todos.filter(t => t.completed === isCompleted);
     return res.json(filtered);
     }
      
     res.json(todos);
    });
    // 獲取單個待辦
    app.get('/todos/:id', (req, res) => {
     const todo = todos.find(t => t.id === parseInt(req.params.id));
     if (!todo) {
     return res.status(404).json({ error: 'Todo not found' });
     }
     res.json(todo);
    });
    // 新增待辦
    app.post('/todos', (req, res) => {
     const { title } = req.body;
      
     if (!title) {
     return res.status(400).json({ error: 'Title is required' });
     }
      
     const newTodo = {
     id: todos.length + 1,
     title,
     completed: false
     };
      
     todos.push(newTodo);
     res.status(201).json(newTodo);
    });
    // 更新待辦
    app.put('/todos/:id', (req, res) => {
     const id = parseInt(req.params.id);
     const todo = todos.find(t => t.id === id);
      
     if (!todo) {
     return res.status(404).json({ error: 'Todo not found' });
     }
      
     todo.title = req.body.title ?? todo.title;
     todo.completed = req.body.completed ?? todo.completed;
      
     res.json(todo);
    });
    // 刪除待辦
    app.delete('/todos/:id', (req, res) => {
     const id = parseInt(req.params.id);
     todos = todos.filter(t => t.id !== id);
     res.status(204).send();
    });
    // 開關完成狀態（PATCH 部分更新）
    app.patch('/todos/:id/toggle', (req, res) => {
     const id = parseInt(req.params.id);
     const todo = todos.find(t => t.id === id);
      
     if (!todo) {
     return res.status(404).json({ error: 'Todo not found' });
     }
      
     todo.completed = !todo.completed;
     res.json(todo);
    });
    const PORT = 3000;
    app.listen(PORT, () => {
     console.log(`Todo API running on http://localhost:${PORT}`);
    });

# 測試你的 API

    bash

    curl http://localhost:3000/todos
    
    curl "http://localhost:3000/todos?completed=false"
    
    curl -X POST http://localhost:3000/todos \
     -H "Content-Type: application/json" \
     -d '{"title": "Buy groceries"}'
    
    curl -X PUT http://localhost:3000/todos/1 \
     -H "Content-Type: application/json" \
     -d '{"completed": true}'
    
    curl -X DELETE http://localhost:3000/todos/2
    
    curl -X PATCH http://localhost:3000/todos/1/toggle
