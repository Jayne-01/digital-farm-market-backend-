const db = require('../config/database');

class Order {
    static async create(orderData) {
        const { customer_id, farmer_id, total_amount, delivery_option } = orderData;
        const query = `
            INSERT INTO orders (customer_id, farmer_id, total_amount, delivery_option)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        return await db.query(query, [customer_id, farmer_id, total_amount, delivery_option]);
    }

    static async addOrderItem(order_id, itemData) {
        const { product_id, quantity, price } = itemData;
        const query = `
            INSERT INTO order_items (order_id, product_id, quantity, price)
            VALUES ($1, $2, $3, $4)
        `;
        return await db.query(query, [order_id, product_id, quantity, price]);
    }

    static async findByCustomer(customer_id) {
        const query = `
            SELECT o.*, f.farm_name, u.full_name as farmer_name
            FROM orders o
            JOIN farmers f ON o.farmer_id = f.farmer_id
            JOIN users u ON f.user_id = u.user_id
            WHERE o.customer_id = $1
            ORDER BY o.order_date DESC
        `;
        return await db.query(query, [customer_id]);
    }

    static async findByFarmer(farmer_id) {
        const query = `
            SELECT o.*, u.full_name as customer_name, u.contact_number, u.address
            FROM orders o
            JOIN users u ON o.customer_id = u.user_id
            WHERE o.farmer_id = $1
            ORDER BY o.order_date DESC
        `;
        return await db.query(query, [farmer_id]);
    }

    static async findById(order_id) {
        const query = `
            SELECT 
                o.*,
                u.full_name as customer_name,
                u.contact_number as customer_contact,
                u.address as customer_address,
                f.farm_name,
                fu.full_name as farmer_name
            FROM orders o
            JOIN users u ON o.customer_id = u.user_id
            JOIN farmers f ON o.farmer_id = f.farmer_id
            JOIN users fu ON f.user_id = fu.user_id
            WHERE o.order_id = $1
        `;
        return await db.query(query, [order_id]);
    }

    static async getOrderItems(order_id) {
        const query = `
            SELECT oi.*, p.product_name, p.category, p.image_url
            FROM order_items oi
            JOIN products p ON oi.product_id = p.product_id
            WHERE oi.order_id = $1
        `;
        return await db.query(query, [order_id]);
    }

    static async updateStatus(order_id, status) {
        const query = 'UPDATE orders SET order_status = $1 WHERE order_id = $2 RETURNING *';
        return await db.query(query, [status, order_id]);
    }

    static async getAllOrders(filters = {}) {
        let query = `
            SELECT o.*, 
                   u.full_name as customer_name,
                   f.farm_name,
                   fu.full_name as farmer_name
            FROM orders o
            JOIN users u ON o.customer_id = u.user_id
            JOIN farmers f ON o.farmer_id = f.farmer_id
            JOIN users fu ON f.user_id = fu.user_id
            WHERE 1=1
        `;
        const values = [];
        let paramIndex = 1;

        if (filters.status) {
            query += ` AND o.order_status = $${paramIndex}`;
            values.push(filters.status);
            paramIndex++;
        }

        if (filters.startDate) {
            query += ` AND o.order_date >= $${paramIndex}`;
            values.push(filters.startDate);
            paramIndex++;
        }

        if (filters.endDate) {
            query += ` AND o.order_date <= $${paramIndex}`;
            values.push(filters.endDate);
            paramIndex++;
        }

        query += ' ORDER BY o.order_date DESC';
        return await db.query(query, values);
    }
}

module.exports = Order;