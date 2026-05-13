// lib/QueryBuilder.js
const mysql = require('mysql2/promise');

class QueryBuilder {
    constructor(table, db) {
        this.table = table;
        this.db = db;
        
        // 查詢狀態
        this.selects = ['*'];
        this.wheres = [];
        this.joins = [];
        this.groupBy = [];
        this.havings = [];
        this.orderBy = [];
        this.limitValue = null;
        this.offsetValue = null;
        this.bindings = [];
    }
    
    // ========== SELECT ==========
    select(...fields) {
        if (fields.length === 0) return this;
        this.selects = fields;
        return this;
    }
    
    // ========== WHERE ==========
    where(column, operator = null, value = null) {
        if (value === null) {
            // where('age', '>', 18)
            value = operator;
            operator = '=';
        }
        
        this.wheres.push({
            type: 'basic',
            column,
            operator,
            value
        });
        this.bindings.push(value);
        return this;
    }
    
    whereIn(column, values) {
        this.wheres.push({
            type: 'in',
            column,
            values
        });
        this.bindings.push(...values);
        return this;
    }
    
    whereBetween(column, [start, end]) {
        this.wheres.push({
            type: 'between',
            column,
            start,
            end
        });
        this.bindings.push(start, end);
        return this;
    }
    
    whereNull(column) {
        this.wheres.push({
            type: 'null',
            column,
            isNull: true
        });
        return this;
    }
    
    whereNotNull(column) {
        this.wheres.push({
            type: 'null',
            column,
            isNull: false
        });
        return this;
    }
    
    orWhere(column, operator = null, value = null) {
        if (value === null) {
            value = operator;
            operator = '=';
        }
        
        this.wheres.push({
            type: 'or',
            column,
            operator,
            value
        });
        this.bindings.push(value);
        return this;
    }
    
    // ========== JOIN ==========
    join(table, first, operator = null, second = null, type = 'INNER') {
        if (second === null) {
            // join('posts', 'users.id', '=', 'posts.user_id')
            second = operator;
            operator = '=';
        }
        
        this.joins.push({
            type,
            table,
            first,
            operator,
            second
        });
        return this;
    }
    
    leftJoin(table, first, operator, second) {
        return this.join(table, first, operator, second, 'LEFT');
    }
    
    rightJoin(table, first, operator, second) {
        return this.join(table, first, operator, second, 'RIGHT');
    }
    
    // ========== GROUP BY & HAVING ==========
    groupBy(...columns) {
        this.groupBy.push(...columns);
        return this;
    }
    
    having(column, operator, value) {
        this.havings.push({ column, operator, value });
        this.bindings.push(value);
        return this;
    }
    
    // ========== ORDER BY ==========
    orderBy(column, direction = 'ASC') {
        this.orderBy.push({ column, direction });
        return this;
    }
    
    // ========== LIMIT & OFFSET ==========
    limit(value) {
        this.limitValue = value;
        return this;
    }
    
    offset(value) {
        this.offsetValue = value;
        return this;
    }
    
    // 分頁輔助
    async paginate(perPage = 15, page = 1) {
        const offset = (page - 1) * perPage;
        
        // 複製一個用來算總數的 builder
        const countBuilder = this.clone();
        const total = await countBuilder.count();
        
        const data = await this.limit(perPage).offset(offset).get();
        
        return {
            data,
            pagination: {
                total,
                perPage,
                currentPage: page,
                lastPage: Math.ceil(total / perPage),
                from: offset + 1,
                to: offset + data.length
            }
        };
    }
    
    // ========== 執行查詢 ==========
    async get() {
        const { sql, bindings } = this.toSQL();
        const [rows] = await this.db.query(sql, bindings);
        return rows;
    }
    
    async first() {
        const rows = await this.limit(1).get();
        return rows[0] || null;
    }
    
    async count(column = '*') {
        const clone = this.clone();
        clone.selects = [`COUNT(${column}) as count`];
        clone.orderBy = [];
        clone.limitValue = null;
        clone.offsetValue = null;
        
        const result = await clone.first();
        return result ? parseInt(result.count) : 0;
    }
    
    async exists() {
        const count = await this.count();
        return count > 0;
    }
    
    // ========== INSERT ==========
    async insert(data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const placeholders = keys.map(() => '?').join(', ');
        
        const sql = `INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${placeholders})`;
        const [result] = await this.db.query(sql, values);
        
        return {
            insertId: result.insertId,
            affectedRows: result.affectedRows
        };
    }
    
    async insertGetId(data) {
        const result = await this.insert(data);
        return result.insertId;
    }
    
    // ========== UPDATE ==========
    async update(data) {
        const setClause = Object.keys(data)
            .map(key => `${key} = ?`)
            .join(', ');
        
        const values = [...Object.values(data), ...this.bindings];
        
        let sql = `UPDATE ${this.table} SET ${setClause}`;
        
        if (this.wheres.length > 0) {
            sql += ` WHERE ${this.buildWhereClause()}`;
        }
        
        const [result] = await this.db.query(sql, values);
        return result.affectedRows;
    }
    
    // ========== DELETE ==========
    async delete() {
        let sql = `DELETE FROM ${this.table}`;
        
        if (this.wheres.length > 0) {
            sql += ` WHERE ${this.buildWhereClause()}`;
        }
        
        const [result] = await this.db.query(sql, this.bindings);
        return result.affectedRows;
    }
    
    // ========== 核心：組裝 SQL ==========
    toSQL() {
        let sql = '';
        const bindings = [...this.bindings];
        
        // SELECT
        sql += `SELECT ${this.selects.join(', ')} `;
        
        // FROM
        sql += `FROM ${this.table} `;
        
        // JOIN
        for (const join of this.joins) {
            sql += `${join.type} JOIN ${join.table} ON ${join.first} ${join.operator} ${join.second} `;
        }
        
        // WHERE
        if (this.wheres.length > 0) {
            sql += `WHERE ${this.buildWhereClause()} `;
        }
        
        // GROUP BY
        if (this.groupBy.length > 0) {
            sql += `GROUP BY ${this.groupBy.join(', ')} `;
        }
        
        // HAVING
        for (const having of this.havings) {
            sql += `HAVING ${having.column} ${having.operator} ? `;
            bindings.push(having.value);
        }
        
        // ORDER BY
        if (this.orderBy.length > 0) {
            const orderStr = this.orderBy.map(o => `${o.column} ${o.direction}`).join(', ');
            sql += `ORDER BY ${orderStr} `;
        }
        
        // LIMIT & OFFSET
        if (this.limitValue !== null) {
            sql += `LIMIT ${this.limitValue} `;
            if (this.offsetValue !== null) {
                sql += `OFFSET ${this.offsetValue} `;
            }
        }
        
        return { sql: sql.trim(), bindings };
    }
    
    buildWhereClause() {
        const clauses = [];
        
        for (const where of this.wheres) {
            switch (where.type) {
                case 'basic':
                    clauses.push(`${where.column} ${where.operator} ?`);
                    break;
                case 'or':
                    clauses.push(`OR ${where.column} ${where.operator} ?`);
                    break;
                case 'in':
                    const placeholders = where.values.map(() => '?').join(', ');
                    clauses.push(`${where.column} IN (${placeholders})`);
                    break;
                case 'between':
                    clauses.push(`${where.column} BETWEEN ? AND ?`);
                    break;
                case 'null':
                    const not = where.isNull ? 'IS NULL' : 'IS NOT NULL';
                    clauses.push(`${where.column} ${not}`);
                    break;
            }
        }
        
        // 處理第一個 OR 變成 WHERE
        let whereStr = clauses.join(' ');
        if (whereStr.startsWith('OR ')) {
            whereStr = whereStr.slice(3);
        }
        
        return whereStr;
    }
    
    // 複製 Builder（用於分頁、count）
    clone() {
        const clone = new QueryBuilder(this.table, this.db);
        clone.selects = [...this.selects];
        clone.wheres = [...this.wheres];
        clone.joins = [...this.joins];
        clone.groupBy = [...this.groupBy];
        clone.havings = [...this.havings];
        clone.orderBy = [...this.orderBy];
        clone.limitValue = this.limitValue;
        clone.offsetValue = this.offsetValue;
        clone.bindings = [...this.bindings];
        return clone;
    }
}

module.exports = QueryBuilder;
