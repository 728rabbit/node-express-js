// 實際使用 app.js
const { db_query } = require('./db');

// ========== 基本查詢 ==========
// SELECT * FROM users WHERE age > 18
const users = await db_query('users')
    .where('age', '>', 18)
    .get();

// ========== 取得第一筆 ==========
const user = await db_query('users')
    .where('email', 'john@example.com')
    .first();

// ========== 指定欄位 + 排序 + 限制 ==========
const activeUsers = await db_query('users')
    .select('id', 'name', 'email')
    .where('status', 'active')
    .orderBy('created_at', 'DESC')
    .limit(10)
    .get();

// ========== JOIN 查詢 ==========
const ordersWithUsers = await db_query('orders')
    .select('orders.*', 'users.name as user_name')
    .join('users', 'orders.user_id', '=', 'users.id')
    .where('orders.status', 'completed')
    .orderBy('orders.created_at', 'DESC')
    .get();

// ========== WHERE IN ==========
const vipUsers = await db_query('users')
    .whereIn('id', [1, 2, 3, 4, 5])
    .where('vip_level', '>', 1)
    .get();

// ========== WHERE BETWEEN ==========
const janOrders = await db_query('orders')
    .whereBetween('created_at', ['2024-01-01', '2024-01-31'])
    .get();

// ========== GROUP BY + HAVING ==========
const userPostStats = await db_query('posts')
    .select('user_id', 'status', 'COUNT(*) as post_count')
    .where('status', 'published')
    .groupBy('user_id', 'status')
    .having('post_count', '>', 5)
    .get();

// ========== 分頁 ==========
const result = await db_query('users')
    .where('status', 'active')
    .orderBy('created_at', 'DESC')
    .paginate(15, 2);  // 每頁15筆，第2頁

console.log(result.data);
console.log(result.pagination);
// {
//   total: 100,
//   perPage: 15,
//   currentPage: 2,
//   lastPage: 7,
//   from: 16,
//   to: 30
// }

// ========== 新增 ==========
const newUserId = await db_query('users')
    .insertGetId({
        name: 'John Doe',
        email: 'john@example.com',
        age: 25
    });

// ========== 更新 ==========
const updatedCount = await db_query('users')
    .where('id', 1)
    .update({ 
        name: 'John Updated',
        age: 26 
    });

// ========== 刪除 ==========
const deletedCount = await db_query('users')
    .where('id', 999)
    .delete();

// ========== 計數 ==========
const activeCount = await db_query('users')
    .where('status', 'active')
    .count();

// ========== 檢查是否存在 ==========
const hasVipUser = await db_query('users')
    .where('vip_level', '>', 5)
    .exists();

// ========== 串聯複雜查詢 ==========
const complexReport = await db_query('orders as o')
    .select(
        'u.name as user_name',
        'u.member_level',
        'p.name as product_name',
        'c.name as category_name',
        'o.total_amount',
        'o.created_at'
    )
    .join('users as u', 'o.user_id', '=', 'u.id')
    .join('order_items as oi', 'o.id', '=', 'oi.order_id')
    .join('products as p', 'oi.product_id', '=', 'p.id')
    .join('categories as c', 'p.category_id', '=', 'c.id')
    .where('o.status', 'completed')
    .whereBetween('o.created_at', ['2024-01-01', '2024-12-31'])
    .whereIn('u.member_level', ['gold', 'platinum'])
    .orderBy('o.total_amount', 'DESC')
    .limit(50)
    .get();
