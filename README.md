# 5 分鐘極速入門 Express

## 第 1 步：初始化項目

    bash
    mkdir my-api
    cd my-api
    npm init -y
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
