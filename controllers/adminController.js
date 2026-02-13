const User = require('../models/userModel');
const Farmer = require('../models/farmerModel');
const Order = require('../models/orderModel');
const Product = require('../models/productModel');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'digital_market',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});


// User Management
const getAllUsers = async (req, res) => {
    try {
        const { role, status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM users WHERE 1=1';
        const values = [];
        let paramIndex = 1;

        if (role) {
            query += ` AND role = $${paramIndex}`;
            values.push(role);
            paramIndex++;
        }

        if (status) {
            query += ` AND status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM (${query}) as total`;
        const countResult = await pool.query(countQuery, values);

        // Add pagination
        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, values);

        res.json({
            users: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getUserDetails = async (req, res) => {
    try {
        const user_id = req.params.id;
        
        const userResult = await User.findById(user_id);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];
        let additionalInfo = {};

        if (user.role === 'FARMER') {
            const farmerResult = await Farmer.findByUserId(user_id);
            if (farmerResult.rows.length > 0) {
                additionalInfo.farmer_profile = farmerResult.rows[0];
                
                // Get farmer statistics
                const statsQuery = `
                    SELECT 
                        COUNT(DISTINCT p.product_id) as total_products,
                        COUNT(DISTINCT o.order_id) as total_orders,
                        COALESCE(AVG(fb.rating), 0) as average_rating,
                        COALESCE(SUM(o.total_amount), 0) as total_sales
                    FROM farmers f
                    LEFT JOIN products p ON f.farmer_id = p.farmer_id
                    LEFT JOIN orders o ON f.farmer_id = o.farmer_id
                    LEFT JOIN feedback fb ON p.product_id = fb.product_id
                    WHERE f.farmer_id = $1
                `;
                const statsResult = await pool.query(statsQuery, [additionalInfo.farmer_profile.farmer_id]);
                additionalInfo.farmer_stats = statsResult.rows[0];
            }
        } else if (user.role === 'CUSTOMER') {
            // Get customer statistics
            const customerQuery = `
                SELECT 
                    COUNT(DISTINCT o.order_id) as total_orders,
                    COALESCE(SUM(o.total_amount), 0) as total_spent,
                    AVG(fb.rating) as avg_feedback_given
                FROM users u
                LEFT JOIN orders o ON u.user_id = o.customer_id
                LEFT JOIN feedback fb ON u.user_id = fb.customer_id
                WHERE u.user_id = $1
                GROUP BY u.user_id
            `;
            const customerResult = await pool.query(customerQuery, [user_id]);
            additionalInfo.customer_stats = customerResult.rows[0];
        }

        res.json({
            user: {
                ...user,
                additional_info: additionalInfo
            }
        });
    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const updateUserStatus = async (req, res) => {
    try {
        const user_id = req.params.id;
        const { status } = req.body;

        const validStatuses = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const userResult = await User.findById(user_id);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent admin from deactivating themselves
        if (user_id === req.user.user_id && status !== 'ACTIVE') {
            return res.status(400).json({ error: 'Cannot change your own status' });
        }

        const result = await User.update(user_id, { status });
        
        res.json({
            message: `User status updated to ${status}`,
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const updateUserRole = async (req, res) => {
    try {
        const user_id = req.params.id;
        const { role } = req.body;

        const validRoles = ['FARMER', 'CUSTOMER', 'ADMIN'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const userResult = await User.findById(user_id);
        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent changing your own role
        if (user_id === req.user.user_id) {
            return res.status(400).json({ error: 'Cannot change your own role' });
        }

        const result = await User.update(user_id, { role });
        
        // If changing to/from farmer, update farmer table
        const currentUser = userResult.rows[0];
        if (currentUser.role === 'FARMER' && role !== 'FARMER') {
            // Remove from farmers table
            await pool.query('DELETE FROM farmers WHERE user_id = $1', [user_id]);
        } else if (currentUser.role !== 'FARMER' && role === 'FARMER') {
            // Add to farmers table
            await Farmer.create(user_id, {
                farm_name: `${currentUser.full_name}'s Farm`,
                barangay: currentUser.address,
                product_categories: ''
            });
        }

        res.json({
            message: `User role updated to ${role}`,
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Farmer Verification
const verifyFarmer = async (req, res) => {
    try {
        const farmer_id = req.params.id;
        const { verified_status } = req.body;

        // ADD THIS VALIDATION:
        if (typeof verified_status !== 'boolean') {
            return res.status(400).json({ error: 'verified_status must be true or false' });

        }    

        const farmerQuery = 'SELECT * FROM farmers WHERE farmer_id = $1';
        const farmerResult = await pool.query(farmerQuery, [farmer_id]);
        
        if (farmerResult.rows.length === 0) {
            return res.status(404).json({ error: 'Farmer not found' });
        }


        const updateQuery = 'UPDATE farmers SET verified_status = $1 WHERE farmer_id = $2 RETURNING *';
        const result = await pool.query(updateQuery, [verified_status, farmer_id]);

        res.json({
            message: `Farmer verification status updated to ${verified_status}`,
            farmer: result.rows[0]
        });
    } catch (error) {
        console.error('Verify farmer error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getPendingVerifications = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                f.*,
                u.full_name,
                u.email,
                u.contact_number,
                u.address,
                u.created_at as user_created_at
            FROM farmers f
            JOIN users u ON f.user_id = u.user_id
            WHERE f.verified_status = false
            AND u.status = 'ACTIVE'
            ORDER BY f.farmer_id
            LIMIT $1 OFFSET $2
        `;

        const countQuery = `
            SELECT COUNT(*) 
            FROM farmers f
            JOIN users u ON f.user_id = u.user_id
            WHERE f.verified_status = false
            AND u.status = 'ACTIVE'
        `;

        const [result, countResult] = await Promise.all([
            pool.query(query, [limit, offset]),
            pool.query(countQuery)
        ]);

        res.json({
            pending_verifications: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
    } catch (error) {
        console.error('Get pending verifications error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Product Management
const getAllProducts = async (req, res) => {
    try {
        const { status, category, farmer_id, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                p.*,
                f.farm_name,
                u.full_name as farmer_name,
                u.contact_number,
                u.barangay
            FROM products p
            JOIN farmers f ON p.farmer_id = f.farmer_id
            JOIN users u ON f.user_id = u.user_id
            WHERE 1=1
        `;
        
        const values = [];
        let paramIndex = 1;

        if (status) {
            query += ` AND p.status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        if (category) {
            query += ` AND p.category = $${paramIndex}`;
            values.push(category);
            paramIndex++;
        }

        if (farmer_id) {
            query += ` AND p.farmer_id = $${paramIndex}`;
            values.push(parseInt(farmer_id));
            paramIndex++;
        }

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM (${query}) as total`;
        const countResult = await pool.query(countQuery, values);

        // Add pagination
        query += ` ORDER BY p.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, values);

        res.json({
            products: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
    } catch (error) {
        console.error('Get all products error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const updateProductStatus = async (req, res) => {
    try {
        const product_id = req.params.id;
        const { status, reason } = req.body;

        const validStatuses = ['AVAILABLE', 'UNAVAILABLE', 'REMOVED', 'UNDER_REVIEW'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const productResult = await Product.findById(product_id);
        if (productResult.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const updateData = { status };
        if (reason && (status === 'REMOVED' || status === 'UNDER_REVIEW')) {
            // Log admin action
            await pool.query(
                'INSERT INTO admin_actions (admin_id, action_type, target_id, details) VALUES ($1, $2, $3, $4)',
                [req.user.user_id, 'PRODUCT_STATUS_CHANGE', product_id, JSON.stringify({ status, reason })]
            );
        }

        const result = await Product.update(product_id, updateData);

        res.json({
            message: `Product status updated to ${status}`,
            product: result.rows[0],
            reason: reason || null
        });
    } catch (error) {
        console.error('Update product status error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// Order Management
const getAllOrders = async (req, res) => {
    try {
        const { status, farmer_id, customer_id, start_date, end_date, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                o.*,
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

        if (status) {
            query += ` AND o.order_status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        if (farmer_id) {
            query += ` AND o.farmer_id = $${paramIndex}`;
            values.push(parseInt(farmer_id));
            paramIndex++;
        }

        if (customer_id) {
            query += ` AND o.customer_id = $${paramIndex}`;
            values.push(parseInt(customer_id));
            paramIndex++;
        }

        if (start_date) {
            query += ` AND o.order_date >= $${paramIndex}`;
            values.push(start_date);
            paramIndex++;
        }

        if (end_date) {
            query += ` AND o.order_date <= $${paramIndex}`;
            values.push(end_date);
            paramIndex++;
        }

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM (${query}) as total`;
        const countResult = await pool.query(countQuery, values);

        // Add pagination
        query += ` ORDER BY o.order_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, values);

        // Get order items for each order
        const ordersWithItems = await Promise.all(result.rows.map(async (order) => {
            const itemsResult = await Order.getOrderItems(order.order_id);
            return {
                ...order,
                items: itemsResult.rows
            };
        }));

        res.json({
            orders: ordersWithItems,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
    } catch (error) {
        console.error('Get all orders error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const updateOrder = async (req, res) => {
    try {
        const order_id = req.params.id;
        const updateData = req.body;

        const orderResult = await Order.findById(order_id);
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Only allow specific fields to be updated by admin
        const allowedFields = ['order_status', 'total_amount', 'delivery_option'];
        const filteredUpdate = {};
        
        for (const field of allowedFields) {
            if (updateData[field] !== undefined) {
                filteredUpdate[field] = updateData[field];
            }
        }

        if (Object.keys(filteredUpdate).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }

        // Update order
        const fields = Object.keys(filteredUpdate).map((key, index) => `${key} = $${index + 2}`).join(', ');
        const values = Object.values(filteredUpdate);
        const query = `UPDATE orders SET ${fields} WHERE order_id = $1 RETURNING *`;
        
        const result = await pool.query(query, [order_id, ...values]);

        // Log admin action
        await pool.query(
            'INSERT INTO admin_actions (admin_id, action_type, target_id, details) VALUES ($1, $2, $3, $4)',
            [req.user.user_id, 'ORDER_UPDATE', order_id, JSON.stringify(filteredUpdate)]
        );

        res.json({
            message: 'Order updated successfully',
            order: result.rows[0]
        });
    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// System Analytics
const getSystemAnalytics = async (req, res) => {
    try {
        const { period = 'monthly' } = req.query;

        let dateRange;
        switch (period) {
            case 'daily':
                dateRange = "CURRENT_DATE - INTERVAL '1 day'";
                break;
            case 'weekly':
                dateRange = "CURRENT_DATE - INTERVAL '7 days'";
                break;
            case 'monthly':
                dateRange = "CURRENT_DATE - INTERVAL '30 days'";
                break;
            default:
                dateRange = "CURRENT_DATE - INTERVAL '30 days'";
        }

        const analyticsQueries = {
            user_stats: `
                SELECT 
                    role,
                    COUNT(*) as count,
                    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
                FROM users 
                WHERE status = 'ACTIVE'
                GROUP BY role
            `,
            farmer_stats: `
                SELECT 
                    verified_status,
                    COUNT(*) as count,
                    AVG(farmer_rating) as avg_rating
                FROM farmers 
                GROUP BY verified_status
            `,
            product_stats: `
                SELECT 
                    status,
                    COUNT(*) as count,
                    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
                FROM products 
                GROUP BY status
            `,
            order_stats: `
                SELECT 
                    order_status,
                    COUNT(*) as count,
                    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage,
                    SUM(total_amount) as total_amount
                FROM orders 
                WHERE order_date >= ${dateRange}
                GROUP BY order_status
            `,
            revenue_trend: `
                SELECT 
                    DATE(order_date) as date,
                    SUM(total_amount) as daily_revenue,
                    COUNT(DISTINCT order_id) as daily_orders
                FROM orders 
                WHERE order_date >= ${dateRange}
                AND order_status = 'DELIVERED'
                GROUP BY DATE(order_date)
                ORDER BY date DESC
            `,
            popular_categories: `
                SELECT 
                    p.category,
                    COUNT(DISTINCT p.product_id) as product_count,
                    SUM(oi.quantity) as total_sold,
                    SUM(oi.quantity * oi.price) as revenue
                FROM products p
                LEFT JOIN order_items oi ON p.product_id = oi.product_id
                GROUP BY p.category
                ORDER BY revenue DESC NULLS LAST
                LIMIT 10
            `,
            top_farmers: `
                SELECT 
                    f.farm_name,
                    u.full_name as farmer_name,
                    COUNT(DISTINCT o.order_id) as total_orders,
                    SUM(o.total_amount) as total_revenue,
                    AVG(fb.rating) as avg_rating
                FROM farmers f
                JOIN users u ON f.user_id = u.user_id
                LEFT JOIN orders o ON f.farmer_id = o.farmer_id
                LEFT JOIN feedback fb ON f.farmer_id = fb.product_id
                WHERE o.order_date >= ${dateRange}
                GROUP BY f.farm_name, u.full_name
                ORDER BY total_revenue DESC NULLS LAST
                LIMIT 10
            `,
            user_growth: `
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as new_users,
                    SUM(COUNT(*)) OVER (ORDER BY DATE(created_at)) as cumulative_users
                FROM users 
                WHERE created_at >= ${dateRange}
                GROUP BY DATE(created_at)
                ORDER BY date
            `
        };

        const results = {};
        for (const [key, query] of Object.entries(analyticsQueries)) {
            const result = await pool.query(query);
            results[key] = result.rows;
        }

        // Calculate summary statistics
        const summary = {
            total_users: results.user_stats.reduce((sum, row) => sum + parseInt(row.count), 0),
            total_farmers: results.user_stats.find(row => row.role === 'FARMER')?.count || 0,
            total_customers: results.user_stats.find(row => row.role === 'CUSTOMER')?.count || 0,
            total_products: results.product_stats.reduce((sum, row) => sum + parseInt(row.count), 0),
            total_orders: results.order_stats.reduce((sum, row) => sum + parseInt(row.count), 0),
            total_revenue: results.order_stats.reduce((sum, row) => sum + parseFloat(row.total_amount || 0), 0),
            verified_farmers: results.farmer_stats.find(row => row.verified_status === true)?.count || 0
        };

        res.json({
            period,
            analytics: results,
            summary,
            generated_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Get system analytics error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

// System Settings
const updateSystemSettings = async (req, res) => {
    try {
        const { settings } = req.body;

        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'Invalid settings data' });
        }

        // In a real application, you would store these in a settings table
        // For this example, we'll just validate and return
        const validSettings = {
            platform_name: 'Digital Market',
            commission_rate: 0.05, // 5% commission
            min_order_amount: 50,
            max_delivery_distance: 20, // km
            support_email: 'support@digitalmarket.com',
            support_phone: '09123456789',
            cod_enabled: true,
            maintenance_mode: false
        };

        // Merge with existing settings (in production, this would update database)
        const updatedSettings = { ...validSettings, ...settings };

        // Log settings change
        await pool.query(
            'INSERT INTO admin_actions (admin_id, action_type, target_id, details) VALUES ($1, $2, $3, $4)',
            [req.user.user_id, 'SYSTEM_SETTINGS_UPDATE', null, JSON.stringify(settings)]
        );

        res.json({
            message: 'System settings updated successfully',
            settings: updatedSettings,
            updated_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Update system settings error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getSystemLogs = async (req, res) => {
    try {
        const { action_type, admin_id, start_date, end_date, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        // Create admin_actions table if it doesn't exist
        await pool.query(`
            CREATE TABLE IF NOT EXISTS admin_actions (
                action_id SERIAL PRIMARY KEY,
                admin_id INT REFERENCES users(user_id),
                action_type VARCHAR(50),
                target_id INT,
                details JSONB,
                ip_address INET,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        let query = `
            SELECT 
                aa.*,
                u.full_name as admin_name,
                u.email as admin_email
            FROM admin_actions aa
            LEFT JOIN users u ON aa.admin_id = u.user_id
            WHERE 1=1
        `;
        
        const values = [];
        let paramIndex = 1;

        if (action_type) {
            query += ` AND aa.action_type = $${paramIndex}`;
            values.push(action_type);
            paramIndex++;
        }

        if (admin_id) {
            query += ` AND aa.admin_id = $${paramIndex}`;
            values.push(parseInt(admin_id));
            paramIndex++;
        }

        if (start_date) {
            query += ` AND aa.created_at >= $${paramIndex}`;
            values.push(start_date);
            paramIndex++;
        }

        if (end_date) {
            query += ` AND aa.created_at <= $${paramIndex}`;
            values.push(end_date);
            paramIndex++;
        }

        // Get total count
        const countQuery = `SELECT COUNT(*) FROM (${query}) as total`;
        const countResult = await pool.query(countQuery, values);

        // Add pagination
        query += ` ORDER BY aa.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, values);

        res.json({
            logs: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: Math.ceil(countResult.rows[0].count / limit)
            }
        });
    } catch (error) {
        console.error('Get system logs error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = {
    // User Management
    getAllUsers,
    getUserDetails,
    updateUserStatus,
    updateUserRole,
    
    // Farmer Management
    verifyFarmer,
    getPendingVerifications,
    
    // Product Management
    getAllProducts,
    updateProductStatus,
    
    // Order Management
    getAllOrders,
    updateOrder,
    
    // System Analytics
    getSystemAnalytics,
    
    // System Settings
    updateSystemSettings,
    getSystemLogs
};