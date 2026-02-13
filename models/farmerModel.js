const db = require('../config/database');


class Farmer {
    static async create(user_id, farmerData) {
        const { farm_name, barangay, product_categories } = farmerData;
        const query = `
            INSERT INTO farmers (user_id, farm_name, barangay, product_categories)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        return await db.query(query, [user_id, farm_name, barangay, product_categories]);
    }

    static async findByUserId(user_id) {
        const query = `
            SELECT f.*, u.full_name, u.email, u.contact_number, u.address
            FROM farmers f
            JOIN users u ON f.user_id = u.user_id
            WHERE f.user_id = $1 AND u.status = 'ACTIVE'
        `;
        return await db.query(query, [user_id]);
    }

    static async getAllFarmers() {
        const query = `
            SELECT f.*, u.full_name, u.email, u.contact_number, u.address
            FROM farmers f
            JOIN users u ON f.user_id = u.user_id
            WHERE u.status = 'ACTIVE'
        `;
        return await db.query(query);
    }

    static async updateFarmerProfile(farmer_id, updateData) {
        const fields = Object.keys(updateData).map((key, index) => `${key} = $${index + 2}`).join(', ');
        const values = Object.values(updateData);
        const query = `UPDATE farmers SET ${fields} WHERE farmer_id = $1 RETURNING *`;
        return await db.query(query, [farmer_id, ...values]);
    }

    static async getFarmerStats(farmer_id) {
        const query = `
            SELECT 
                f.farmer_id,
                f.farm_name,
                COUNT(DISTINCT p.product_id) as total_products,
                COUNT(DISTINCT o.order_id) as total_orders,
                COALESCE(AVG(fb.rating), 0) as average_rating,
                COALESCE(SUM(o.total_amount), 0) as total_sales
            FROM farmers f
            LEFT JOIN products p ON f.farmer_id = p.farmer_id
            LEFT JOIN orders o ON f.farmer_id = o.farmer_id
            LEFT JOIN feedback fb ON p.product_id = fb.product_id
            WHERE f.farmer_id = $1
            GROUP BY f.farmer_id, f.farm_name
        `;
        return await db.query(query, [farmer_id]);
    }

    static async getUnavailableProducts(farmer_id) {
    const query = `
        SELECT * FROM products 
        WHERE farmer_id = $1 
        AND status = 'UNAVAILABLE'
        ORDER BY updated_at DESC
        LIMIT 5
    `;
    return await db.query(query, [farmer_id]);}

static async getRecentFeedback(farmer_id) {
    const query = `
        SELECT f.*, p.product_name, u.full_name as customer_name
        FROM feedback f
        JOIN products p ON f.product_id = p.product_id
        JOIN users u ON f.customer_id = u.user_id
        WHERE p.farmer_id = $1
        ORDER BY f.created_at DESC
        LIMIT 5`;
    return await db.query(query, [farmer_id]);}
}

module.exports = Farmer;