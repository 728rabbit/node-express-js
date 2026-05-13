
# WebSocket 即時通訊完整實作

## 一、WebSocket 是什麼？

    HTTP 模式：
    Client ──請求──> Server
    Client <──回應── Server
    
    WebSocket 模式：
    Client <──= 持續雙向通訊 =──> Server

## 二、安裝套件

    bash
    
    npm install socket.io
    npm install socket.io-client  # 客戶端用
    # 如果使用 Express
    npm install socket.io@latest

----------

## 三、專案結構

    text
    
    project/
    ├── server.js
    ├── socket/
    │   ├── index.js           # Socket.IO 初始化
    │   ├── handlers/
    │   │   ├── chat.js        # 聊天相關事件
    │   │   ├── room.js        # 房間相關事件
    │   │   └── user.js        # 使用者相關事件
    │   └── middleware/
    │       └── auth.js        # Socket 認證
    ├── public/
    │   └── chat.html          # 客戶端範例
    └── uploads/               # 頭像目錄

----------

## 四、資料庫設計

    sql
    
    -- 聊天室資料表
    CREATE TABLE `chat_rooms` (
     `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
     `room_id` VARCHAR(50) NOT NULL,
     `name` VARCHAR(100) NOT NULL,
     `type` ENUM('private', 'group') DEFAULT 'private',
     `created_by` INT UNSIGNED NOT NULL,
     `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (`id`),
     UNIQUE KEY `uk_room_id` (`room_id`),
     INDEX `idx_type` (`type`)
    );
    -- 聊天訊息表
    CREATE TABLE `chat_messages` (
     `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
     `room_id` VARCHAR(50) NOT NULL,
     `user_id` INT UNSIGNED NOT NULL,
     `message` TEXT NOT NULL,
     `message_type` ENUM('text', 'image', 'file') DEFAULT 'text',
     `file_url` VARCHAR(500) DEFAULT NULL,
     `is_read` TINYINT(1) DEFAULT 0,
     `is_deleted` TINYINT(1) DEFAULT 0,
     `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (`id`),
     INDEX `idx_room_id` (`room_id`),
     INDEX `idx_created_at` (`created_at`),
     INDEX `idx_user_id` (`user_id`)
    );
    -- 房間成員表
    CREATE TABLE `chat_participants` (
     `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
     `room_id` VARCHAR(50) NOT NULL,
     `user_id` INT UNSIGNED NOT NULL,
     `last_read_at` DATETIME DEFAULT NULL,
     `joined_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
     `left_at` DATETIME DEFAULT NULL,
     PRIMARY KEY (`id`),
     UNIQUE KEY `uk_room_user` (`room_id`, `user_id`),
     INDEX `idx_user_id` (`user_id`)
    );
    -- 使用者的 Socket 連線記錄（輔助廣播）
    CREATE TABLE `user_sockets` (
     `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
     `user_id` INT UNSIGNED NOT NULL,
     `socket_id` VARCHAR(100) NOT NULL,
     `status` ENUM('online', 'offline', 'away') DEFAULT 'online',
     `last_activity` DATETIME DEFAULT CURRENT_TIMESTAMP,
     `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (`id`),
     INDEX `idx_user_id` (`user_id`),
     INDEX `idx_socket_id` (`socket_id`)
    );

----------

## 五、Socket 認證 Middleware

    javascript
    
    // socket/middleware/auth.js
    const { verifyToken } = require('../../utils/jwt');
    const { table } = require('../../config/database');
    async function socketAuth(socket, next) {
     try {
     // 從 handshake 取得 token
     const token = socket.handshake.auth.token || 
     socket.handshake.headers.authorization?.replace('Bearer ', '');
      
     if (!token) {
     return next(new Error('Authentication required'));
     }
      
     // 驗證 token
     const result = verifyToken(token);
     if (!result.valid) {
     return next(new Error('Invalid token'));
     }
      
     // 取得使用者資料
     const user = await table('users')
     .select('id', 'uuid', 'username', 'email', 'role', 'avatar')
     .where('id', result.decoded.userId)
     .where('is_active', 1)
     .first();
      
     if (!user) {
     return next(new Error('User not found'));
     }
      
     // 將使用者資訊掛到 socket 上
     socket.user = user;
      
     // 記錄 socket 連線
     await table('user_sockets').insert({
     user_id: user.id,
     socket_id: socket.id,
     status: 'online',
     last_activity: new Date()
     });
      
     // 更新舊的連線狀態（同一個使用者的其他裝置）
     await table('user_sockets')
     .where('user_id', user.id)
     .where('socket_id', '!=', socket.id)
     .update({ status: 'offline' });
      
     next();
      
     } catch (error) {
     console.error('Socket auth error:', error);
     next(new Error('Authentication failed'));
     }
    }
    module.exports = { socketAuth };

----------

## 六、聊天事件處理器

    javascript
    
    // socket/handlers/chat.js
    const { table, query } = require('../../config/database');
    const { v4: uuidv4 } = require('uuid');
    class ChatHandler {
     constructor(io, socket) {
     this.io = io;
     this.socket = socket;
     this.userId = socket.user.id;
     }
      
     // 加入聊天室（訂閱訊息）
     async joinRoom(roomId) {
     try {
     // 檢查使用者是否為房間成員
     const isMember = await table('chat_participants')
     .where('room_id', roomId)
     .where('user_id', this.userId)
     .whereNull('left_at')
     .first();
      
     if (!isMember) {
     // 如果是私聊，自動建立房間
     const targetUserId = parseInt(roomId);
     if (targetUserId) {
     const room = await this.createPrivateRoom(targetUserId);
     if (room) {
     roomId = room.room_id;
     } else {
     this.socket.emit('error', { message: '無法建立聊天室' });
     return;
     }
     } else {
     this.socket.emit('error', { message: '你不是這個房間的成員' });
     return;
     }
     }
      
     // 加入 Socket.IO 房間
     this.socket.join(roomId);
      
     // 更新最後讀取時間
     await table('chat_participants')
     .where('room_id', roomId)
     .where('user_id', this.userId)
     .update({ last_read_at: new Date() });
      
     // 發送房間訊息記錄
     const messages = await table('chat_messages')
     .select(
     'chat_messages.*',
     'users.username',
     'users.avatar'
     )
     .leftJoin('users', 'chat_messages.user_id', '=', 'users.id')
     .where('chat_messages.room_id', roomId)
     .where('chat_messages.is_deleted', 0)
     .orderBy('chat_messages.created_at', 'DESC')
     .limit(50);
      
     this.socket.emit('room_joined', {
     roomId,
     messages: messages.reverse(),
     participants: await this.getRoomParticipants(roomId)
     });
      
     // 通知房間其他人
     this.socket.to(roomId).emit('user_joined', {
     userId: this.userId,
     username: this.socket.user.username,
     timestamp: new Date()
     });
      
     } catch (error) {
     console.error('Join room error:', error);
     this.socket.emit('error', { message: '加入聊天室失敗' });
     }
     }
      
     // 離開聊天室
     async leaveRoom(roomId) {
     try {
     this.socket.leave(roomId);
      
     // 更新離開時間（可選）
     await table('chat_participants')
     .where('room_id', roomId)
     .where('user_id', this.userId)
     .update({ left_at: new Date() });
      
     this.socket.to(roomId).emit('user_left', {
     userId: this.userId,
     username: this.socket.user.username,
     timestamp: new Date()
     });
      
     } catch (error) {
     console.error('Leave room error:', error);
     }
     }
      
     // 發送訊息
     async sendMessage(data) {
     try {
     const { roomId, message, messageType = 'text', fileUrl = null } = data;
      
     if (!roomId || !message) {
     this.socket.emit('error', { message: '缺少必要參數' });
     return;
     }
      
     // 儲存到資料庫
     const messageId = await table('chat_messages').insertGetId({
     room_id: roomId,
     user_id: this.userId,
     message,
     message_type: messageType,
     file_url: fileUrl,
     is_read: false,
     created_at: new Date()
     });
      
     // 取得完整訊息資料
     const newMessage = await table('chat_messages')
     .select(
     'chat_messages.*',
     'users.username',
     'users.avatar'
     )
     .leftJoin('users', 'chat_messages.user_id', '=', 'users.id')
     .where('chat_messages.id', messageId)
     .first();
      
     // 廣播給房間所有人
     this.io.to(roomId).emit('new_message', {
     ...newMessage,
     roomId
     });
      
     // 更新房間成員最後讀取時間（發送者自己）
     await table('chat_participants')
     .where('room_id', roomId)
     .where('user_id', this.userId)
     .update({ last_read_at: new Date() });
      
     // 發送未讀計數給其他成員
     await this.updateUnreadCount(roomId, this.userId);
      
     } catch (error) {
     console.error('Send message error:', error);
     this.socket.emit('error', { message: '發送訊息失敗' });
     }
     }
      
     // 標記為已讀
     async markAsRead(roomId) {
     try {
     // 更新最後讀取時間
     await table('chat_participants')
     .where('room_id', roomId)
     .where('user_id', this.userId)
     .update({ last_read_at: new Date() });
      
     // 取得未讀訊息
     const unreadMessages = await table('chat_messages')
     .where('room_id', roomId)
     .where('user_id', '!=', this.userId)
     .where('is_read', 0)
     .update({ is_read: 1 });
      
     // 通知房間其他人（某人已讀）
     this.socket.to(roomId).emit('messages_read', {
     roomId,
     userId: this.userId,
     readAt: new Date()
     });
      
     } catch (error) {
     console.error('Mark as read error:', error);
     }
     }
      
     // 刪除訊息
     async deleteMessage(messageId) {
     try {
     const message = await table('chat_messages')
     .where('id', messageId)
     .first();
      
     if (!message) {
     this.socket.emit('error', { message: '訊息不存在' });
     return;
     }
      
     // 只有發送者可以刪除
     if (message.user_id !== this.userId) {
     this.socket.emit('error', { message: '無權限刪除此訊息' });
     return;
     }
      
     await table('chat_messages')
     .where('id', messageId)
     .update({ is_deleted: 1 });
      
     this.io.to(message.room_id).emit('message_deleted', {
     messageId,
     roomId: message.room_id,
     deletedBy: this.userId
     });
      
     } catch (error) {
     console.error('Delete message error:', error);
     }
     }
      
     // 建立私聊房間
     async createPrivateRoom(targetUserId) {
     try {
     // 檢查是否已存在私聊房間
     const existingRoom = await query(`
     SELECT cr.* 
     FROM chat_rooms cr
     INNER JOIN chat_participants cp1 ON cr.room_id = cp1.room_id
     INNER JOIN chat_participants cp2 ON cr.room_id = cp2.room_id
     WHERE cr.type = 'private'
     AND cp1.user_id = ?
     AND cp2.user_id = ?
     AND cp1.left_at IS NULL
     AND cp2.left_at IS NULL
     `, [this.userId, targetUserId]);
      
     if (existingRoom.length > 0) {
     return existingRoom[0];
     }
      
     // 建立新房間
     const roomId = `private_${uuidv4().slice(0, 8)}`;
      
     await table('chat_rooms').insert({
     room_id: roomId,
     name: '',
     type: 'private',
     created_by: this.userId
     });
      
     // 加入兩位成員
     await table('chat_participants').insert([
     { room_id: roomId, user_id: this.userId },
     { room_id: roomId, user_id: targetUserId }
     ]);
      
     return { room_id: roomId };
      
     } catch (error) {
     console.error('Create private room error:', error);
     return null;
     }
     }
      
     // 建立群組聊天室
     async createGroupRoom(data) {
     try {
     const { name, memberIds } = data;
      
     if (!name || !memberIds || !memberIds.length) {
     this.socket.emit('error', { message: '缺少必要參數' });
     return;
     }
      
     const roomId = `group_${uuidv4().slice(0, 8)}`;
      
     // 建立群組
     await table('chat_rooms').insert({
     room_id: roomId,
     name,
     type: 'group',
     created_by: this.userId
     });
      
     // 加入成員（包含建立者）
     const participants = [
     { room_id: roomId, user_id: this.userId },
     ...memberIds.map(uid => ({ room_id: roomId, user_id: uid }))
     ];
      
     await table('chat_participants').insert(participants);
      
     // 通知所有成員
     const memberSocketIds = await this.getMemberSocketIds([this.userId, ...memberIds]);
     this.io.to(memberSocketIds).emit('group_created', {
     roomId,
     name,
     createdBy: this.userId,
     members: participants
     });
      
     this.socket.emit('group_created_success', { roomId });
      
     } catch (error) {
     console.error('Create group error:', error);
     this.socket.emit('error', { message: '建立群組失敗' });
     }
     }
      
     // 取得房間參與者
     async getRoomParticipants(roomId) {
     const participants = await table('chat_participants')
     .select(
     'chat_participants.*',
     'users.username',
     'users.avatar',
     'users.email'
     )
     .leftJoin('users', 'chat_participants.user_id', '=', 'users.id')
     .where('chat_participants.room_id', roomId)
     .whereNull('chat_participants.left_at');
      
     // 加上上線狀態
     const onlineUsers = await table('user_sockets')
     .select('user_id')
     .where('status', 'online')
     .groupBy('user_id');
      
     const onlineIds = new Set(onlineUsers.map(u => u.user_id));
      
     return participants.map(p => ({
     ...p,
     is_online: onlineIds.has(p.user_id)
     }));
     }
      
     // 更新未讀計數
     async updateUnreadCount(roomId, senderId) {
     const participants = await table('chat_participants')
     .where('room_id', roomId)
     .where('user_id', '!=', senderId)
     .whereNull('left_at');
      
     for (const participant of participants) {
     // 計算該成員的未讀數量
     const unreadCount = await table('chat_messages')
     .where('room_id', roomId)
     .where('user_id', '!=', participant.user_id)
     .where('created_at', '>', participant.last_read_at || '1970-01-01')
     .where('is_read', 0)
     .count('* as count')
     .first();
      
     // 發送未讀計數給該成員
     const memberSockets = await this.getMemberSocketIds([participant.user_id]);
     this.io.to(memberSockets).emit('unread_count', {
     roomId,
     count: unreadCount?.count || 0
     });
     }
     }
      
     // 取得成員的 socket IDs
     async getMemberSocketIds(userIds) {
     const sockets = await table('user_sockets')
     .select('socket_id')
     .whereIn('user_id', userIds)
     .where('status', 'online');
      
     return sockets.map(s => s.socket_id);
     }
      
     // 輸入中⋯ 狀態
     async typing(data) {
     const { roomId, isTyping } = data;
     this.socket.to(roomId).emit('user_typing', {
     userId: this.userId,
     username: this.socket.user.username,
     isTyping,
     timestamp: new Date()
     });
     }
    }
    module.exports = ChatHandler;

----------

## 七、房間處理器（群組管理）

    javascript
    
    // socket/handlers/room.js
    const { table } = require('../../config/database');
    class RoomHandler {
     constructor(io, socket) {
     this.io = io;
     this.socket = socket;
     this.userId = socket.user.id;
     }
      
     // 取得我的聊天室列表
     async getMyRooms() {
     try {
     const rooms = await table('chat_participants')
     .select(
     'chat_rooms.room_id',
     'chat_rooms.name',
     'chat_rooms.type',
     'chat_participants.last_read_at'
     )
     .leftJoin('chat_rooms', 'chat_participants.room_id', '=', 'chat_rooms.room_id')
     .where('chat_participants.user_id', this.userId)
     .whereNull('chat_participants.left_at')
     .orderBy('chat_participants.last_read_at', 'DESC');
      
     // 取得每個房間的最後一則訊息和未讀數量
     for (const room of rooms) {
     const lastMessage = await table('chat_messages')
     .select(
     'chat_messages.*',
     'users.username'
     )
     .leftJoin('users', 'chat_messages.user_id', '=', 'users.id')
     .where('chat_messages.room_id', room.room_id)
     .where('chat_messages.is_deleted', 0)
     .orderBy('chat_messages.created_at', 'DESC')
     .first();
      
     const unreadCount = await table('chat_messages')
     .where('room_id', room.room_id)
     .where('user_id', '!=', this.userId)
     .where('created_at', '>', room.last_read_at || '1970-01-01')
     .where('is_read', 0)
     .count('* as count')
     .first();
      
     room.last_message = lastMessage;
     room.unread_count = unreadCount?.count || 0;
     }
      
     this.socket.emit('my_rooms', rooms);
      
     } catch (error) {
     console.error('Get my rooms error:', error);
     }
     }
      
     // 邀請成員加入群組
     async inviteToGroup(roomId, userIds) {
     try {
     // 檢查是否為群組管理員或建立者
     const room = await table('chat_rooms')
     .where('room_id', roomId)
     .where('type', 'group')
     .first();
      
     if (!room) {
     this.socket.emit('error', { message: '群組不存在' });
     return;
     }
      
     // 簡單檢查：只有建立者可以邀請
     if (room.created_by !== this.userId) {
     this.socket.emit('error', { message: '只有群組建立者可以邀請成員' });
     return;
     }
      
     // 新增成員（過濾已存在的）
     for (const userId of userIds) {
     const existing = await table('chat_participants')
     .where('room_id', roomId)
     .where('user_id', userId)
     .first();
      
     if (!existing) {
     await table('chat_participants').insert({
     room_id: roomId,
     user_id: userId
     });
      
     // 發送系統訊息
     await table('chat_messages').insert({
     room_id: roomId,
     user_id: this.userId,
     message: `${this.socket.user.username} 邀請使用者加入群組`,
     message_type: 'system',
     is_read: false
     });
     }
     }
      
     // 通知所有成員
     const memberIds = await table('chat_participants')
     .select('user_id')
     .where('room_id', roomId)
     .whereNull('left_at');
      
     const memberSocketIds = await this.getMemberSocketIds(memberIds.map(m => m.user_id));
     this.io.to(memberSocketIds).emit('group_members_updated', {
     roomId,
     action: 'invite',
     invitedBy: this.userId,
     newMembers: userIds
     });
      
     } catch (error) {
     console.error('Invite to group error:', error);
     }
     }
      
     // 離開群組
     async leaveGroup(roomId) {
     try {
     await table('chat_participants')
     .where('room_id', roomId)
     .where('user_id', this.userId)
     .update({ left_at: new Date() });
      
     // 發送系統訊息
     await table('chat_messages').insert({
     room_id: roomId,
     user_id: this.userId,
     message: `${this.socket.user.username} 離開了群組`,
     message_type: 'system',
     is_read: false
     });
      
     // 離開 Socket 房間
     this.socket.leave(roomId);
      
     // 通知其他成員
     const memberSocketIds = await this.getMemberSocketIds([this.userId]);
     this.io.to(memberSocketIds).emit('user_left_group', {
     roomId,
     userId: this.userId,
     username: this.socket.user.username
     });
      
     } catch (error) {
     console.error('Leave group error:', error);
     }
     }
      
     async getMemberSocketIds(userIds) {
     const { table } = require('../../config/database');
     const sockets = await table('user_sockets')
     .select('socket_id')
     .whereIn('user_id', userIds)
     .where('status', 'online');
      
     return sockets.map(s => s.socket_id);
     }
    }
    module.exports = RoomHandler;

----------

## 八、使用者狀態處理器

    javascript
    
    // socket/handlers/user.js
    const { table } = require('../../config/database');
    class UserHandler {
     constructor(io, socket) {
     this.io = io;
     this.socket = socket;
     this.userId = socket.user.id;
     }
      
     // 更新使用者狀態
     async updateStatus(status) {
     try {
     await table('user_sockets')
     .where('socket_id', this.socket.id)
     .update({
     status,
     last_activity: new Date()
     });
      
     // 廣播給所有好友或相關房間
     this.io.emit('user_status_changed', {
     userId: this.userId,
     username: this.socket.user.username,
     status,
     timestamp: new Date()
     });
      
     } catch (error) {
     console.error('Update status error:', error);
     }
     }
      
     // 心跳（維持連線）
     async heartbeat() {
     await table('user_sockets')
     .where('socket_id', this.socket.id)
     .update({ last_activity: new Date() });
     }
      
     // 搜尋使用者（用於新增聊天）
     async searchUsers(keyword) {
     try {
     const users = await table('users')
     .select('id', 'username', 'email', 'avatar')
     .where('username', 'LIKE', `%${keyword}%`)
     .orWhere('email', 'LIKE', `%${keyword}%`)
     .where('id', '!=', this.userId)
     .limit(20);
      
     this.socket.emit('search_results', users);
      
     } catch (error) {
     console.error('Search users error:', error);
     }
     }
      
     // 取得好友列表（最近聊過天的人）
     async getRecentChats() {
     try {
     const chats = await table('chat_participants')
     .select(
     'chat_rooms.room_id',
     'chat_rooms.type',
     'chat_participants.user_id',
     'users.username',
     'users.avatar',
     'chat_participants.last_read_at'
     )
     .leftJoin('chat_rooms', 'chat_participants.room_id', '=', 'chat_rooms.room_id')
     .leftJoin('users', function() {
     this.on('chat_participants.user_id', '=', 'users.id')
     .andOn('chat_participants.user_id', '!=', this.userId);
     })
     .where('chat_participants.user_id', this.userId)
     .whereNull('chat_participants.left_at')
     .orderBy('chat_participants.last_read_at', 'DESC')
     .limit(50);
      
     this.socket.emit('recent_chats', chats);
      
     } catch (error) {
     console.error('Get recent chats error:', error);
     }
     }
    }
    module.exports = UserHandler;

----------

## 九、[Socket.IO](https://socket.io/) 主程式

    javascript
    
    // socket/index.js
    const { Server } = require('socket.io');
    const { socketAuth } = require('./middleware/auth');
    const ChatHandler = require('./handlers/chat');
    const RoomHandler = require('./handlers/room');
    const UserHandler = require('./handlers/user');
    function setupSocket(server) {
     const io = new Server(server, {
     cors: {
     origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
     credentials: true
     },
     // 連線設定
     pingTimeout: 60000,      // 60 秒無回應則斷線
     pingInterval: 25000,     // 每 25 秒發送 ping
     transports: ['websocket', 'polling']  // 優先使用 WebSocket
     });
      
     // 認證 middleware
     io.use(socketAuth);
      
     io.on('connection', (socket) => {
     console.log(`🔌 User connected: ${socket.user.username} (${socket.id})`);
      
     // 初始化 handlers
     const chatHandler = new ChatHandler(io, socket);
     const roomHandler = new RoomHandler(io, socket);
     const userHandler = new UserHandler(io, socket);
      
     // ========== 聊天相關事件 ==========
     socket.on('join_room', (roomId) => chatHandler.joinRoom(roomId));
     socket.on('leave_room', (roomId) => chatHandler.leaveRoom(roomId));
     socket.on('send_message', (data) => chatHandler.sendMessage(data));
     socket.on('mark_read', (roomId) => chatHandler.markAsRead(roomId));
     socket.on('delete_message', (messageId) => chatHandler.deleteMessage(messageId));
     socket.on('typing', (data) => chatHandler.typing(data));
     socket.on('create_private_room', (targetUserId) => chatHandler.createPrivateRoom(targetUserId));
     socket.on('create_group_room', (data) => chatHandler.createGroupRoom(data));
      
     // ========== 房間相關事件 ==========
     socket.on('get_my_rooms', () => roomHandler.getMyRooms());
     socket.on('invite_to_group', (roomId, userIds) => roomHandler.inviteToGroup(roomId, userIds));
     socket.on('leave_group', (roomId) => roomHandler.leaveGroup(roomId));
      
     // ========== 使用者相關事件 ==========
     socket.on('update_status', (status) => userHandler.updateStatus(status));
     socket.on('heartbeat', () => userHandler.heartbeat());
     socket.on('search_users', (keyword) => userHandler.searchUsers(keyword));
     socket.on('get_recent_chats', () => userHandler.getRecentChats());
      
     // ========== 斷線處理 ==========
     socket.on('disconnect', async () => {
     console.log(`🔌 User disconnected: ${socket.user.username} (${socket.id})`);
      
     // 更新使用者狀態
     const { table } = require('../config/database');
     await table('user_sockets')
     .where('socket_id', socket.id)
     .update({ status: 'offline' });
      
     // 檢查該使用者是否還有其他連線
     const otherSockets = await table('user_sockets')
     .where('user_id', socket.user.id)
     .where('status', 'online')
     .where('socket_id', '!=', socket.id)
     .first();
      
     // 如果沒有其他連線，廣播離線狀態
     if (!otherSockets) {
     io.emit('user_status_changed', {
     userId: socket.user.id,
     username: socket.user.username,
     status: 'offline',
     timestamp: new Date()
     });
     }
     });
     });
      
     return io;
    }
    module.exports = setupSocket;

----------

## 十、整合到 Express

    javascript
    
    // server.js
    require('dotenv').config();
    const express = require('express');
    const http = require('http');
    const cors = require('cors');
    const path = require('path');
    const setupSocket = require('./socket');
    const { ensureDirectories } = require('./utils/storage');
    const app = express();
    const server = http.createServer(app);
    // 基本 middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.static('public'));
    // 靜態檔案（頭像、上傳圖片）
    app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
    // 初始化 WebSocket
    const io = setupSocket(server);
    // REST API 路由（先前寫的那些）
    app.use('/api/auth', require('./routes/authRoutes'));
    app.use('/api/upload', require('./routes/uploadRoutes'));
    // 簡單的首頁
    app.get('/', (req, res) => {
     res.sendFile(path.join(__dirname, 'public', 'chat.html'));
    });
    // 啟動伺服器
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
     console.log(`🚀 Server running on http://localhost:${PORT}`);
     console.log(`🔌 WebSocket ready`);
     ensureDirectories();
    });

----------

## 十一、客戶端範例（HTML + JavaScript）

    html
    
    <!-- public/chat.html -->
    <!DOCTYPE html>
    <html>
    <head>
     <title>即時通訊聊天室</title>
     <script src="https://cdn.socket.io/4.5.0/socket.io.min.js"></script>
     <style>
     * { margin: 0; padding: 0; box-sizing: border-box; }
     body { font-family: system-ui, sans-serif; background: #1a1a2e; }
     .chat-container { display: flex; height: 100vh; }
      
     /* 側邊欄 */
     .sidebar {
     width: 300px;
     background: #16213e;
     color: white;
     display: flex;
     flex-direction: column;
     }
     .sidebar-header {
     padding: 20px;
     border-bottom: 1px solid #0f3460;
     }
     .rooms-list {
     flex: 1;
     overflow-y: auto;
     }
     .room-item {
     padding: 15px 20px;
     cursor: pointer;
     border-bottom: 1px solid #0f3460;
     transition: background 0.2s;
     }
     .room-item:hover { background: #0f3460; }
     .room-item.active { background: #e94560; }
     .room-name { font-weight: bold; margin-bottom: 5px; }
     .last-message { font-size: 12px; color: #aaa; }
     .unread-badge {
     background: #e94560;
     border-radius: 50%;
     padding: 2px 8px;
     font-size: 12px;
     float: right;
     }
      
     /* 主聊天區域 */
     .chat-area {
     flex: 1;
     display: flex;
     flex-direction: column;
     background: #0f3460;
     }
     .chat-header {
     padding: 20px;
     background: #16213e;
     color: white;
     border-bottom: 1px solid #0f3460;
     }
     .messages {
     flex: 1;
     overflow-y: auto;
     padding: 20px;
     display: flex;
     flex-direction: column;
     }
     .message {
     max-width: 60%;
     margin-bottom: 15px;
     display: flex;
     flex-direction: column;
     }
     .message.own { align-self: flex-end; }
     .message.own .message-content {
     background: #e94560;
     color: white;
     }
     .message-content {
     padding: 10px 15px;
     border-radius: 18px;
     background: #16213e;
     color: white;
     word-wrap: break-word;
     }
     .message-info {
     font-size: 11px;
     color: #aaa;
     margin-top: 4px;
     margin-left: 10px;
     }
     .typing-indicator {
     padding: 10px 20px;
     color: #aaa;
     font-style: italic;
     font-size: 12px;
     }
     .input-area {
     padding: 20px;
     background: #16213e;
     display: flex;
     gap: 10px;
     }
     .input-area input {
     flex: 1;
     padding: 12px;
     border: none;
     border-radius: 25px;
     background: #0f3460;
     color: white;
     outline: none;
     }
     .input-area button {
     padding: 12px 24px;
     background: #e94560;
     border: none;
     border-radius: 25px;
     color: white;
     cursor: pointer;
     }
      
     /* 登入畫面 */
     .login-container {
     display: flex;
     justify-content: center;
     align-items: center;
     height: 100vh;
     background: #1a1a2e;
     }
     .login-box {
     background: #16213e;
     padding: 40px;
     border-radius: 10px;
     width: 350px;
     }
     .login-box input {
     width: 100%;
     padding: 12px;
     margin: 10px 0;
     border: none;
     border-radius: 5px;
     background: #0f3460;
     color: white;
     }
     .login-box button {
     width: 100%;
     padding: 12px;
     background: #e94560;
     border: none;
     border-radius: 5px;
     color: white;
     cursor: pointer;
     margin-top: 10px;
     }
     .error { color: #e94560; font-size: 12px; margin-top: 10px; }
     h3 { margin-bottom: 20px; text-align: center; color: white; }
     </style>
    </head>
    <body>
     <div id="app">
     <!-- 登入畫面 -->
     <div class="login-container" id="loginContainer">
     <div class="login-box">
     <h3>💬 即時通訊聊天室</h3>
     <input type="email" id="email" placeholder="Email" autocomplete="off">
     <input type="password" id="password" placeholder="密碼">
     <button onclick="login()">登入</button>
     <div id="loginError" class="error"></div>
     </div>
     </div>
      
     <!-- 聊天畫面（預設隱藏） -->
     <div class="chat-container" id="chatContainer" style="display: none;">
     <div class="sidebar">
     <div class="sidebar-header">
     <h3 id="currentUser"></h3>
     <div style="font-size: 12px; color: #aaa;">
     <span id="onlineStatus">● 連線中</span>
     </div>
     </div>
     <div class="rooms-list" id="roomsList"></div>
     <div style="padding: 15px;">
     <input type="text" id="searchUser" placeholder="🔍 搜尋使用者..." 
     style="width: 100%; padding: 8px; border-radius: 20px; border: none; background: #0f3460; color: white;">
     <div id="searchResults" style="margin-top: 10px;"></div>
     </div>
     </div>
      
     <div class="chat-area">
     <div class="chat-header">
     <div id="currentRoomName">未選擇聊天室</div>
     <div id="roomParticipants" style="font-size: 12px; color: #aaa;"></div>
     </div>
     <div class="messages" id="messages"></div>
     <div class="typing-indicator" id="typingIndicator"></div>
     <div class="input-area">
     <input type="text" id="messageInput" placeholder="輸入訊息..." 
     onkeypress="if(event.key==='Enter') sendMessage()">
     <button onclick="sendMessage()">發送</button>
     </div>
     </div>
     </div>
     </div>
     <script>
     let socket = null;
     let currentRoomId = null;
     let currentUser = null;
     let typingTimeout = null;
      
     // 登入
     async function login() {
     const email = document.getElementById('email').value;
     const password = document.getElementById('password').value;
     const errorDiv = document.getElementById('loginError');
      
     errorDiv.textContent = '';
      
     try {
     const response = await fetch('http://localhost:3000/api/auth/login', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ email, password })
     });
      
     const result = await response.json();
      
     if (result.success) {
     currentUser = result.data.user;
     localStorage.setItem('accessToken', result.data.accessToken);
     localStorage.setItem('refreshToken', result.data.refreshToken);
     initSocket();
     showChat();
     } else {
     errorDiv.textContent = result.message;
     }
     } catch (error) {
     errorDiv.textContent = '登入失敗：' + error.message;
     }
     }
      
     // 初始化 WebSocket
     function initSocket() {
     const token = localStorage.getItem('accessToken');
      
     socket = io('http://localhost:3000', {
     auth: { token },
     transports: ['websocket']
     });
      
     // 連線成功
     socket.on('connect', () => {
     document.getElementById('onlineStatus').innerHTML = '● 已連線';
     console.log('WebSocket connected');
      
     // 取得聊天室列表
     socket.emit('get_my_rooms');
     });
      
     // 斷線
     socket.on('disconnect', () => {
     document.getElementById('onlineStatus').innerHTML = '● 離線';
     });
      
     // 取得我的聊天室列表
     socket.on('my_rooms', (rooms) => {
     renderRooms(rooms);
     });
      
     // 加入房間成功
     socket.on('room_joined', (data) => {
     currentRoomId = data.roomId;
     renderMessages(data.messages);
     document.getElementById('currentRoomName').innerHTML = 
     data.roomId.includes('private') ? '私聊' : data.roomId;
     renderParticipants(data.participants);
     });
      
     // 收到新訊息
     socket.on('new_message', (message) => {
     addMessageToChat(message);
     });
      
     // 使用者加入
     socket.on('user_joined', (data) => {
     addSystemMessage(`${data.username} 加入了聊天室`);
     });
      
     // 使用者離開
     socket.on('user_left', (data) => {
     addSystemMessage(`${data.username} 離開了聊天室`);
     });
      
     // 輸入中⋯
     socket.on('user_typing', (data) => {
     const indicator = document.getElementById('typingIndicator');
     if (data.isTyping) {
     indicator.innerHTML = `${data.username} 正在輸入...`;
     setTimeout(() => {
     if (indicator.innerHTML.includes(data.username)) {
     indicator.innerHTML = '';
     }
     }, 2000);
     }
     });
      
     // 未讀計數
     socket.on('unread_count', (data) => {
     updateUnreadCount(data.roomId, data.count);
     });
      
     // 群組建立成功
     socket.on('group_created_success', (data) => {
     socket.emit('get_my_rooms');
     alert('群組建立成功！');
     });
      
     // 搜尋結果
     socket.on('search_results', (users) => {
     const resultsDiv = document.getElementById('searchResults');
     if (users.length === 0) {
     resultsDiv.innerHTML = '<div style="color:#aaa; font-size:12px;">找不到使用者</div>';
     return;
     }
      
     resultsDiv.innerHTML = users.map(u => `
     <div onclick="startPrivateChat(${u.id})" style="padding: 8px; cursor: pointer; background: #0f3460; margin-bottom: 5px; border-radius: 5px;">
     <strong>${u.username}</strong><br>
     <small style="color:#aaa;">${u.email}</small>
     </div>
     `).join('');
     });
     }
      
     // 開始私聊
     function startPrivateChat(userId) {
     socket.emit('create_private_room', userId);
     setTimeout(() => {
     socket.emit('get_my_rooms');
     }, 500);
     document.getElementById('searchResults').innerHTML = '';
     document.getElementById('searchUser').value = '';
     }
      
     // 加入聊天室
     function joinRoom(roomId) {
     if (currentRoomId) {
     socket.emit('leave_room', currentRoomId);
     }
     socket.emit('join_room', roomId);
     }
      
     // 發送訊息
     function sendMessage() {
     const input = document.getElementById('messageInput');
     const message = input.value.trim();
      
     if (!message || !currentRoomId) return;
      
     socket.emit('send_message', {
     roomId: currentRoomId,
     message: message,
     messageType: 'text'
     });
      
     input.value = '';
      
     // 觸發輸入中⋯ 結束
     if (typingTimeout) clearTimeout(typingTimeout);
     socket.emit('typing', { roomId: currentRoomId, isTyping: false });
     }
      
     // 輸入中⋯
     function onTyping() {
     if (!currentRoomId) return;
      
     socket.emit('typing', { roomId: currentRoomId, isTyping: true });
      
     if (typingTimeout) clearTimeout(typingTimeout);
     typingTimeout = setTimeout(() => {
     socket.emit('typing', { roomId: currentRoomId, isTyping: false });
     }, 1000);
     }
      
     // 搜尋使用者
     document.getElementById('searchUser')?.addEventListener('input', (e) => {
     const keyword = e.target.value.trim();
     if (keyword.length >= 2) {
     socket.emit('search_users', keyword);
     } else {
     document.getElementById('searchResults').innerHTML = '';
     }
     });
      
     // 監聽輸入事件
     document.getElementById('messageInput')?.addEventListener('input', onTyping);
      
     // 渲染聊天室列表
     function renderRooms(rooms) {
     const container = document.getElementById('roomsList');
     container.innerHTML = rooms.map(room => `
     <div class="room-item" onclick="joinRoom('${room.room_id}')">
     <div class="room-name">
     ${room.name || (room.room_id.includes('private') ? '私聊' : room.room_id)}
     ${room.unread_count > 0 ? `<span class="unread-badge">${room.unread_count}</span>` : ''}
     </div>
     ${room.last_message ? `<div class="last-message">${room.last_message.username}: ${room.last_message.message.substring(0, 30)}</div>` : ''}
     </div>
     `).join('');
     }
      
     // 渲染訊息
     function renderMessages(messages) {
     const container = document.getElementById('messages');
     container.innerHTML = '';
     messages.forEach(msg => addMessageToChat(msg));
     container.scrollTop = container.scrollHeight;
     }
      
     // 新增訊息到聊天室
     function addMessageToChat(message) {
     const container = document.getElementById('messages');
     const isOwn = message.user_id === currentUser.id;
      
     const messageDiv = document.createElement('div');
     messageDiv.className = `message ${isOwn ? 'own' : ''}`;
     messageDiv.innerHTML = `
     <div class="message-content">${escapeHtml(message.message)}</div>
     <div class="message-info">
     ${!isOwn ? `<span>${message.username}</span> · ` : ''}
     ${new Date(message.created_at).toLocaleTimeString()}
     </div>
     `;
      
     container.appendChild(messageDiv);
     container.scrollTop = container.scrollHeight;
     }
      
     // 系統訊息
     function addSystemMessage(text) {
     const container = document.getElementById('messages');
     const sysDiv = document.createElement('div');
     sysDiv.style.textAlign = 'center';
     sysDiv.style.color = '#aaa';
     sysDiv.style.fontSize = '12px';
     sysDiv.style.margin = '10px 0';
     sysDiv.innerHTML = text;
     container.appendChild(sysDiv);
     container.scrollTop = container.scrollHeight;
     }
      
     // 渲染參與者
     function renderParticipants(participants) {
     const container = document.getElementById('roomParticipants');
     const online = participants.filter(p => p.is_online).length;
     container.innerHTML = `${participants.length} 位成員 · ${online} 人在線`;
     }
      
     // 更新未讀
     function updateUnreadCount(roomId, count) {
     const rooms = document.querySelectorAll('.room-item');
     for (let room of rooms) {
     if (room.onclick.toString().includes(roomId)) {
     const badge = room.querySelector('.unread-badge');
     if (count > 0) {
     if (badge) badge.textContent = count;
     else room.querySelector('.room-name').insertAdjacentHTML('beforeend', `<span class="unread-badge">${count}</span>`);
     } else if (badge) {
     badge.remove();
     }
     }
     }
     }
      
     // 顯示聊天畫面
     function showChat() {
     document.getElementById('loginContainer').style.display = 'none';
     document.getElementById('chatContainer').style.display = 'flex';
     document.getElementById('currentUser').innerHTML = `👤 ${currentUser.username}`;
     }
      
     // 登出
     function logout() {
     if (socket) socket.disconnect();
     localStorage.removeItem('accessToken');
     localStorage.removeItem('refreshToken');
     location.reload();
     }
      
     // XSS 防護
     function escapeHtml(text) {
     const div = document.createElement('div');
     div.textContent = text;
     return div.innerHTML;
     }
     </script>
    </body>
    </html>

----------

## 十二、測試步驟
    
    bash
    
    # 1. 啟動伺服器
    node server.js
    # 2. 開兩個瀏覽器（或用無痕模式）
    # 3. 分別用不同帳號登入
    # 4. 搜尋對方 ID，開始聊天
    # 5. 測試群組功能
