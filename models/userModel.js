const db = require('../config/database');

class User {
    static async create(userData) {
        const { full_name, email, password, contact_number, barangay, address } = userData;
        const query = `
            INSERT INTO users (full_name, email, password, contact_number, barangay, address)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING user_id, full_name, email, contact_number, barangay, address, created_at
        `;
        return await db.query(query, [full_name, email, password, contact_number, barangay, address]);
    }

    static async findByEmail(email) {
        const query = 'SELECT * FROM users WHERE email = $1';
        return await db.query(query, [email]);
    }

    static async findById(user_id) {
        const query = 'SELECT * FROM users WHERE user_id = $1';
        return await db.query(query, [user_id]);
    }

    static async update(user_id, updateData) {
        const fields = Object.keys(updateData).map((key, index) => `${key} = $${index + 2}`).join(', ');
        const values = Object.values(updateData);
        const query = `UPDATE users SET ${fields} WHERE user_id = $1 RETURNING *`;
        return await db.query(query, [user_id, ...values]);
    }

    static async delete(user_id) {
        const query = 'UPDATE users SET status = $1 WHERE user_id = $2';
        return await db.query(query, ['INACTIVE', user_id]);
    }

    static async getAllUsers(role = null) {
        let query = 'SELECT * FROM users WHERE status = $1';
        const values = ['ACTIVE'];
        
        if (role) {
            query += ' AND role = $2';
            values.push(role);
        }
        
        return await db.query(query, values);
    }
}

module.exports = User;