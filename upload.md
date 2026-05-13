
# 檔案上傳完整實作 📁

好的！我們來做一個**完整的檔案上傳系統**，支援單檔、多檔、頭像上傳，包含檔案驗證、縮圖產生、錯誤處理。

----------

## 一、安裝套件

    bash
    
    # 核心套件
    npm install multer           # 檔案上傳中間件
    npm install sharp            # 圖片處理（縮圖、壓縮）
    npm install uuid             # 產生唯一檔名
    # 輔助套件（選用）
    npm install express-rate-limit  # 上傳限流
    npm install helmet              # 安全性

----------

## 二、目錄結構

    text
    
    project/
    ├── uploads/                    # 上傳檔案目錄（需手動建立）
    │   ├── avatars/               # 頭像
    │   ├── images/                # 一般圖片
    │   ├── documents/             # 文件
    │   └── temp/                  # 暫存檔
    ├── src/
    │   ├── config/
    │   │   └── multer.js          # Multer 設定
    │   ├── middleware/
    │   │   └── upload.js          # 上傳中間件
    │   ├── controllers/
    │   │   └── uploadController.js
    │   ├── routes/
    │   │   └── uploadRoutes.js
    │   └── utils/
    │       └── imageProcessor.js  # 圖片處理工具
    └── app.js

----------

## 三、建立上傳目錄

    javascript
    
    // utils/storage.js
    const fs = require('fs');
    const path = require('path');
    // 上傳目錄設定
    const UPLOAD_DIRS = {
     avatars: 'uploads/avatars',
     images: 'uploads/images',
     documents: 'uploads/documents',
     temp: 'uploads/temp'
    };
    // 確保目錄存在
    function ensureDirectories() {
     Object.values(UPLOAD_DIRS).forEach(dir => {
     const fullPath = path.join(process.cwd(), dir);
     if (!fs.existsSync(fullPath)) {
     fs.mkdirSync(fullPath, { recursive: true });
     console.log(`📁 建立目錄：${fullPath}`);
     }
     });
    }
    // 刪除檔案
    function deleteFile(filePath) {
     try {
     const fullPath = path.join(process.cwd(), filePath);
     if (fs.existsSync(fullPath)) {
     fs.unlinkSync(fullPath);
     return true;
     }
     } catch (error) {
     console.error('刪除檔案失敗：', error);
     }
     return false;
    }
    // 取得檔案大小（人類可讀）
    function getFileSize(bytes) {
     if (bytes === 0) return '0 B';
     const k = 1024;
     const sizes = ['B', 'KB', 'MB', 'GB'];
     const i = Math.floor(Math.log(bytes) / Math.log(k));
     return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    module.exports = {
     UPLOAD_DIRS,
     ensureDirectories,
     deleteFile,
     getFileSize
    };

----------

## 四、Multer 設定

    javascript
    
    // config/multer.js
    const multer = require('multer');
    const path = require('path');
    const { v4: uuidv4 } = require('uuid');
    const { UPLOAD_DIRS } = require('../utils/storage');
    // 允許的檔案類型
    const ALLOWED_FILE_TYPES = {
     // 圖片
     image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
     // 文件
     document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
     // 壓縮檔
     archive: ['application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed']
    };
    // 所有允許的類型
    const ALLOWED_MIME_TYPES = [
     ...ALLOWED_FILE_TYPES.image,
     ...ALLOWED_FILE_TYPES.document,
     ...ALLOWED_FILE_TYPES.archive
    ];
    // 檔案大小限制（單位：bytes）
    const FILE_SIZE_LIMITS = {
     avatar: 2 * 1024 * 1024,      // 2MB
     image: 5 * 1024 * 1024,       // 5MB
     document: 10 * 1024 * 1024,   // 10MB
     default: 5 * 1024 * 1024      // 5MB
    };
    // 自訂儲存引擎：保留原始檔名 + 產生唯一檔名
    const storage = multer.diskStorage({
     destination: (req, file, cb) => {
     // 根據檔案類型決定目錄
     let folder = UPLOAD_DIRS.images;
      
     if (file.fieldname === 'avatar') {
     folder = UPLOAD_DIRS.avatars;
     } else if (file.fieldname === 'document') {
     folder = UPLOAD_DIRS.documents;
     } else if (file.fieldname === 'temp') {
     folder = UPLOAD_DIRS.temp;
     }
      
     cb(null, folder);
     },
     filename: (req, file, cb) => {
     // 產生唯一檔名：時間戳 + UUID + 原始副檔名
     const ext = path.extname(file.originalname);
     const filename = `${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
     cb(null, filename);
     }
    });
    // 檔案過濾器
    const fileFilter = (req, file, cb) => {
     const allowedTypes = req.allowedTypes || ALLOWED_MIME_TYPES;
      
     if (allowedTypes.includes(file.mimetype)) {
     cb(null, true);
     } else {
     cb(new Error(`不支援的檔案類型：${file.mimetype}`), false);
     }
    };
    // 建立 Multer 實例
    const createMulter = (options = {}) => {
     const {
     limits = FILE_SIZE_LIMITS.default,
     allowedTypes = ALLOWED_MIME_TYPES,
     fields = null
     } = options;
      
     const multerConfig = {
     storage,
     limits: {
     fileSize: limits,
     files: options.maxFiles || 10
     },
     fileFilter: (req, file, cb) => {
     if (allowedTypes.includes(file.mimetype)) {
     cb(null, true);
     } else {
     cb(new Error(`不支援的檔案類型：${file.mimetype}`), false);
     }
     }
     };
      
     return multer(multerConfig);
    };
    // 預設上傳設定
    const upload = createMulter();
    // 頭像上傳設定
    const avatarUpload = createMulter({
     limits: FILE_SIZE_LIMITS.avatar,
     allowedTypes: ALLOWED_FILE_TYPES.image,
     maxFiles: 1
    });
    // 圖片上傳設定
    const imageUpload = createMulter({
     limits: FILE_SIZE_LIMITS.image,
     allowedTypes: ALLOWED_FILE_TYPES.image,
     maxFiles: 10
    });
    // 文件上傳設定
    const documentUpload = createMulter({
     limits: FILE_SIZE_LIMITS.document,
     allowedTypes: ALLOWED_FILE_TYPES.document,
     maxFiles: 5
    });
    module.exports = {
     upload,
     avatarUpload,
     imageUpload,
     documentUpload,
     ALLOWED_FILE_TYPES,
     FILE_SIZE_LIMITS,
     createMulter
    };

----------

## 五、圖片處理工具（Sharp）

    javascript
    
    // utils/imageProcessor.js
    const sharp = require('sharp');
    const path = require('path');
    const fs = require('fs');
    const { UPLOAD_DIRS } = require('./storage');
    // 產生縮圖
    async function generateThumbnail(inputPath, outputPath, options = {}) {
     const {
     width = 200,
     height = 200,
     fit = 'cover',  // cover, contain, fill, inside, outside
     quality = 80
     } = options;
      
     try {
     await sharp(inputPath)
     .resize(width, height, { fit })
     .jpeg({ quality })
     .toFile(outputPath);
      
     return outputPath;
     } catch (error) {
     console.error('產生縮圖失敗：', error);
     return null;
     }
    }
    // 壓縮圖片
    async function compressImage(inputPath, outputPath, options = {}) {
     const {
     width = null,      // 不指定則保持原尺寸
     quality = 80,
     format = 'jpeg'    // jpeg, png, webp
     } = options;
      
     try {
     let pipeline = sharp(inputPath);
      
     if (width) {
     pipeline = pipeline.resize(width, null, { withoutEnlargement: true });
     }
      
     switch (format) {
     case 'jpeg':
     pipeline = pipeline.jpeg({ quality });
     break;
     case 'png':
     pipeline = pipeline.png({ quality });
     break;
     case 'webp':
     pipeline = pipeline.webp({ quality });
     break;
     }
      
     await pipeline.toFile(outputPath);
     return outputPath;
     } catch (error) {
     console.error('壓縮圖片失敗：', error);
     return null;
     }
    }
    // 取得圖片資訊
    async function getImageInfo(imagePath) {
     try {
     const metadata = await sharp(imagePath).metadata();
     return {
     width: metadata.width,
     height: metadata.height,
     format: metadata.format,
     size: metadata.size,
     hasAlpha: metadata.hasAlpha
     };
     } catch (error) {
     console.error('取得圖片資訊失敗：', error);
     return null;
     }
    }
    // 裁切圖片（頭像專用）
    async function cropAvatar(inputPath, outputPath, options = {}) {
     const {
     width = 400,
     height = 400,
     left = 0,
     top = 0
     } = options;
      
     try {
     await sharp(inputPath)
     .extract({ left, top, width, height })
     .resize(200, 200)
     .jpeg({ quality: 85 })
     .toFile(outputPath);
      
     return outputPath;
     } catch (error) {
     console.error('裁切頭像失敗：', error);
     return null;
     }
    }
    // 浮水印
    async function addWatermark(inputPath, outputPath, watermarkPath, options = {}) {
     const {
     position = 'southeast', // northwest, northeast, southwest, southeast, center
     opacity = 0.5
     } = options;
      
     try {
     const watermark = sharp(watermarkPath);
     const watermarkBuffer = await watermark.png().toBuffer();
      
     await sharp(inputPath)
     .composite([{
     input: watermarkBuffer,
     gravity: position,
     blend: 'over',
     opacity
     }])
     .toFile(outputPath);
      
     return outputPath;
     } catch (error) {
     console.error('加入浮水印失敗：', error);
     return null;
     }
    }
    module.exports = {
     generateThumbnail,
     compressImage,
     getImageInfo,
     cropAvatar,
     addWatermark
    };

----------

## 六、上傳控制器

    javascript
    
    // controllers/uploadController.js
    const fs = require('fs');
    const path = require('path');
    const { UPLOAD_DIRS, deleteFile, getFileSize } = require('../utils/storage');
    const { generateThumbnail, compressImage, getImageInfo } = require('../utils/imageProcessor');
    // 單檔上傳
    async function uploadSingle(req, res, next) {
     try {
     if (!req.file) {
     return res.status(400).json({
     success: false,
     message: '請選擇要上傳的檔案'
     });
     }
      
     const file = req.file;
      
     // 如果是圖片，產生縮圖
     let thumbnailPath = null;
     if (file.mimetype.startsWith('image/')) {
     const thumbnailDir = path.join(path.dirname(file.path), 'thumbnails');
     if (!fs.existsSync(thumbnailDir)) {
     fs.mkdirSync(thumbnailDir, { recursive: true });
     }
      
     const thumbnailFile = path.join(thumbnailDir, `thumb_${path.basename(file.path)}`);
     await generateThumbnail(file.path, thumbnailFile, {
     width: 200,
     height: 200
     });
     thumbnailPath = thumbnailFile.replace(/\\/g, '/');
     }
      
     res.json({
     success: true,
     message: '上傳成功',
     data: {
     originalName: file.originalname,
     filename: file.filename,
     path: file.path.replace(/\\/g, '/'),
     size: file.size,
     sizeHuman: getFileSize(file.size),
     mimetype: file.mimetype,
     thumbnail: thumbnailPath
     }
     });
      
     } catch (error) {
     next(error);
     }
    }
    // 多檔上傳
    async function uploadMultiple(req, res, next) {
     try {
     if (!req.files || req.files.length === 0) {
     return res.status(400).json({
     success: false,
     message: '請選擇要上傳的檔案'
     });
     }
      
     const files = req.files.map(file => ({
     originalName: file.originalname,
     filename: file.filename,
     path: file.path.replace(/\\/g, '/'),
     size: file.size,
     sizeHuman: getFileSize(file.size),
     mimetype: file.mimetype
     }));
      
     res.json({
     success: true,
     message: `成功上傳 ${files.length} 個檔案`,
     data: { files, count: files.length }
     });
      
     } catch (error) {
     next(error);
     }
    }
    // 上傳頭像（特別處理）
    async function uploadAvatar(req, res, next) {
     try {
     if (!req.file) {
     return res.status(400).json({
     success: false,
     message: '請選擇頭像圖片'
     });
     }
      
     const file = req.file;
      
     // 檢查是否為圖片
     if (!file.mimetype.startsWith('image/')) {
     // 刪除已上傳的檔案
     deleteFile(file.path);
     return res.status(400).json({
     success: false,
     message: '頭像必須是圖片檔案'
     });
     }
      
     // 壓縮圖片
     const compressedPath = file.path.replace(/\.\w+$/, '_compressed.jpg');
     await compressImage(file.path, compressedPath, {
     width: 500,
     quality: 80,
     format: 'jpeg'
     });
      
     // 刪除原始檔案
     deleteFile(file.path);
      
     // 更新資料庫中的頭像路徑
     const userId = req.user.id;
     const avatarUrl = `/uploads/avatars/${path.basename(compressedPath)}`;
      
     // 假設有 users table
     const { table } = require('../config/database');
     await table('users')
     .where('id', userId)
     .update({ avatar: avatarUrl });
      
     // 刪除舊的頭像檔案（如果有）
     const oldUser = await table('users')
     .select('avatar')
     .where('id', userId)
     .first();
      
     if (oldUser && oldUser.avatar) {
     const oldPath = path.join(process.cwd(), oldUser.avatar);
     deleteFile(oldPath);
     }
      
     res.json({
     success: true,
     message: '頭像更新成功',
     data: {
     avatarUrl,
     path: compressedPath.replace(/\\/g, '/')
     }
     });
      
     } catch (error) {
     next(error);
     }
    }
    // 刪除檔案
    async function deleteUpload(req, res, next) {
     try {
     const { filePath } = req.body;
      
     if (!filePath) {
     return res.status(400).json({
     success: false,
     message: '請提供檔案路徑'
     });
     }
      
     // 安全性檢查：只能刪除 uploads 目錄下的檔案
     if (!filePath.startsWith('uploads/')) {
     return res.status(403).json({
     success: false,
     message: '不允許刪除此檔案'
     });
     }
      
     const fullPath = path.join(process.cwd(), filePath);
      
     if (!fs.existsSync(fullPath)) {
     return res.status(404).json({
     success: false,
     message: '檔案不存在'
     });
     }
      
     deleteFile(fullPath);
      
     // 同時刪除縮圖（如果存在）
     const dir = path.dirname(fullPath);
     const thumbDir = path.join(dir, 'thumbnails');
     const thumbFile = path.join(thumbDir, `thumb_${path.basename(fullPath)}`);
     deleteFile(thumbFile);
      
     res.json({
     success: true,
     message: '刪除成功'
     });
      
     } catch (error) {
     next(error);
     }
    }
    // 取得檔案資訊
    async function fileInfo(req, res, next) {
     try {
     const { filename } = req.params;
      
     // 搜尋所有上傳目錄
     let foundPath = null;
      
     for (const dir of Object.values(UPLOAD_DIRS)) {
     const testPath = path.join(process.cwd(), dir, filename);
     if (fs.existsSync(testPath)) {
     foundPath = testPath;
     break;
     }
     }
      
     if (!foundPath) {
     return res.status(404).json({
     success: false,
     message: '檔案不存在'
     });
     }
      
     const stats = fs.statSync(foundPath);
     const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(path.extname(filename).toLowerCase());
      
     let imageInfo = null;
     if (isImage) {
     imageInfo = await getImageInfo(foundPath);
     }
      
     res.json({
     success: true,
     data: {
     filename,
     path: foundPath.replace(process.cwd(), '').replace(/\\/g, '/'),
     size: stats.size,
     sizeHuman: getFileSize(stats.size),
     createdAt: stats.birthtime,
     modifiedAt: stats.mtime,
     isImage,
     imageInfo
     }
     });
      
     } catch (error) {
     next(error);
     }
    }
    // 批次上傳（Base64，適合手機拍照上傳）
    async function uploadBase64(req, res, next) {
     try {
     const { images } = req.body; // [{ filename, base64 }]
      
     if (!images || !Array.isArray(images)) {
     return res.status(400).json({
     success: false,
     message: '請提供圖片陣列'
     });
     }
      
     const uploaded = [];
      
     for (const img of images) {
     const matches = img.base64.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
     if (!matches) continue;
      
     const extension = matches[1];
     const base64Data = matches[2];
     const buffer = Buffer.from(base64Data, 'base64');
      
     const filename = `${Date.now()}-${uuidv4().slice(0, 8)}.${extension}`;
     const filepath = path.join(UPLOAD_DIRS.images, filename);
      
     fs.writeFileSync(filepath, buffer);
      
     uploaded.push({
     filename,
     path: filepath.replace(/\\/g, '/'),
     size: buffer.length,
     sizeHuman: getFileSize(buffer.length)
     });
     }
      
     res.json({
     success: true,
     message: `成功上傳 ${uploaded.length} 張圖片`,
     data: { files: uploaded }
     });
      
     } catch (error) {
     next(error);
     }
    }
    module.exports = {
     uploadSingle,
     uploadMultiple,
     uploadAvatar,
     deleteUpload,
     fileInfo,
     uploadBase64
    };

----------

## 七、路由設定

    javascript
    
    // routes/uploadRoutes.js
    const express = require('express');
    const router = express.Router();
    const rateLimit = require('express-rate-limit');
    const {
     uploadSingle,
     uploadMultiple,
     uploadAvatar,
     deleteUpload,
     fileInfo,
     uploadBase64
    } = require('../controllers/uploadController');
    const { authMiddleware } = require('../middleware/auth');
    const { avatarUpload, imageUpload, documentUpload } = require('../config/multer');
    // 上傳限流（防止濫用）
    const uploadLimiter = rateLimit({
     windowMs: 60 * 60 * 1000, // 1 小時
     max: 50,                  // 最多 50 次
     message: { success: false, message: '上傳次數過多，請稍後再試' }
    });
    // 需要登入才能上傳
    router.use(authMiddleware);
    router.use(uploadLimiter);
    // 上傳路由
    router.post('/single', imageUpload.single('file'), uploadSingle);
    router.post('/multiple', imageUpload.array('files', 10), uploadMultiple);
    router.post('/avatar', avatarUpload.single('avatar'), uploadAvatar);
    router.post('/base64', uploadBase64);
    // 刪除檔案
    router.delete('/:filename', deleteUpload);
    // 取得檔案資訊
    router.get('/info/:filename', fileInfo);
    module.exports = router;

----------

## 八、靜態檔案服務

    javascript
    
    // app.js 中加入
    const express = require('express');
    const path = require('path');
    const { ensureDirectories } = require('./utils/storage');
    // 確保上傳目錄存在
    ensureDirectories();
    // 提供靜態檔案服務
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
    app.use('/avatars', express.static(path.join(__dirname, 'uploads/avatars')));

----------

## 九、前端上傳範例

### React 範例

    jsx
    
    // components/AvatarUpload.jsx
    import React, { useState } from 'react';
    import axios from 'axios';
    const AvatarUpload = () => {
     const [avatar, setAvatar] = useState(null);
     const [preview, setPreview] = useState(null);
     const [uploading, setUploading] = useState(false);
     const [error, setError] = useState(null);
     const handleFileChange = (e) => {
     const file = e.target.files[0];
     if (file) {
     setAvatar(file);
     setPreview(URL.createObjectURL(file));
     setError(null);
     }
     };
     const handleUpload = async () => {
     if (!avatar) return;
     setUploading(true);
     setError(null);
     const formData = new FormData();
     formData.append('avatar', avatar);
     try {
     const token = localStorage.getItem('accessToken');
     const response = await axios.post(
     'http://localhost:3000/api/upload/avatar',
     formData,
     {
     headers: {
     'Authorization': `Bearer ${token}`,
     'Content-Type': 'multipart/form-data'
     }
     }
     );
     if (response.data.success) {
     // 更新使用者頭像
     alert('頭像更新成功！');
     }
     } catch (err) {
     setError(err.response?.data?.message || '上傳失敗');
     } finally {
     setUploading(false);
     }
     };
     return (
     <div className="avatar-upload">
     <h3>上傳頭像</h3>
      
     {preview && (
     <img 
     src={preview} 
     alt="預覽" 
     style={{ width: 100, height: 100, borderRadius: '50%' }}
     />
     )}
      
     <input 
     type="file" 
     accept="image/*"
     onChange={handleFileChange}
     disabled={uploading}
     />
      
     <button onClick={handleUpload} disabled={uploading || !avatar}>
     {uploading ? '上傳中...' : '上傳頭像'}
     </button>
      
     {error && <p style={{ color: 'red' }}>{error}</p>}
     </div>
     );
    };
    export default AvatarUpload;

### 原生 HTML + Fetch 範例

    html
    
    <!-- upload.html -->
    <!DOCTYPE html>
    <html>
    <head>
     <title>檔案上傳示範</title>
    </head>
    <body>
     <h2>單檔上傳</h2>
     <input type="file" id="singleFile" accept="image/*">
     <button onclick="uploadSingle()">上傳</button>
     <h2>多檔上傳</h2>
     <input type="file" id="multipleFiles" multiple accept="image/*">
     <button onclick="uploadMultiple()">上傳多檔</button>
     <div id="result"></div>
     <script>
     const API_URL = 'http://localhost:3000/api';
     const token = localStorage.getItem('accessToken');
     async function uploadSingle() {
     const file = document.getElementById('singleFile').files[0];
     if (!file) return alert('請選擇檔案');
     const formData = new FormData();
     formData.append('file', file);
     const response = await fetch(`${API_URL}/upload/single`, {
     method: 'POST',
     headers: {
     'Authorization': `Bearer ${token}`
     },
     body: formData
     });
     const result = await response.json();
     document.getElementById('result').innerHTML = JSON.stringify(result, null, 2);
     }
     async function uploadMultiple() {
     const files = document.getElementById('multipleFiles').files;
     if (files.length === 0) return alert('請選擇檔案');
     const formData = new FormData();
     for (let file of files) {
     formData.append('files', file);
     }
     const response = await fetch(`${API_URL}/upload/multiple`, {
     method: 'POST',
     headers: {
     'Authorization': `Bearer ${token}`
     },
     body: formData
     });
     const result = await response.json();
     document.getElementById('result').innerHTML = JSON.stringify(result, null, 2);
     }
     </script>
    </body>
    </html>

----------

## 十、Multer 錯誤處理

    javascript
    
    // middleware/errorHandler.js 中加入 Multer 錯誤處理
    function multerErrorHandler(err, req, res, next) {
     if (err instanceof multer.MulterError) {
     // Multer 特定錯誤
     switch (err.code) {
     case 'FILE_TOO_LARGE':
     return res.status(413).json({
     success: false,
     message: '檔案太大，超過限制大小'
     });
     case 'LIMIT_FILE_COUNT':
     return res.status(400).json({
     success: false,
     message: '超過最大檔案數量限制'
     });
     case 'LIMIT_UNEXPECTED_FILE':
     return res.status(400).json({
     success: false,
     message: '不預期的檔案欄位'
     });
     default:
     return res.status(400).json({
     success: false,
     message: `上傳錯誤：${err.message}`
     });
     }
     }
      
     next(err);
    }
    module.exports = { multerErrorHandler };
