const db = require('../config/database');

class Product {
    // Create a new product
    static async create(productData) {
        const {farmer_id, product_name, category, price, harvest_date, description, image_url, status } = productData;
        
        const query = `INSERT INTO products (farmer_id,  product_name, category, price, harvest_date, description, image_url, status )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)RETURNING *`;
        
        const values = [
            farmer_id, 
            product_name, 
            category, 
            price, 
            harvest_date || null, 
            description || '', 
            image_url || '', 
            status || 'AVAILABLE'
        ];
        
        return await db.query(query, values);
    }

    // Get all products by a specific farmer
    static async findByFarmer(farmer_id) {
        const query = ` SELECT  p.*, f.farm_name, u.full_name as farmer_name, u.contact_number, u.barangay
            FROM products p
            JOIN farmers f ON p.farmer_id = f.farmer_id
            JOIN users u ON f.user_id = u.user_id
            WHERE p.farmer_id = $1
            ORDER BY 
                CASE p.status 
                    WHEN 'AVAILABLE' THEN 1 
                    ELSE 2 
                END,
                p.created_at DESC
        `;
        return await db.query(query, [farmer_id]);
    }

    // Get product by ID with farmer details
    static async findById(product_id) {
        const query = `
            SELECT 
                p.*,
                f.farm_name, f.verified_status, u.full_name as farmer_name, u.contact_number, u.email,  u.barangay
            FROM products p
            JOIN farmers f ON p.farmer_id = f.farmer_id
            JOIN users u ON f.user_id = u.user_id
            WHERE p.product_id = $1
        `;
        return await db.query(query, [product_id]);
    }

    // Get all products with filtering
    static async getAllProducts(filters = {}) {
        let query = `
            SELECT 
                p.*, f.farm_name, u.full_name as farmer_name, u.barangay,
                COALESCE((
                    SELECT COUNT(*) 
                    FROM product_views pv 
                    WHERE pv.product_id = p.product_id
                ), 0) as view_count
            FROM products p
            JOIN farmers f ON p.farmer_id = f.farmer_id
            JOIN users u ON f.user_id = u.user_id
            WHERE 1=1
        `;
        
        const values = [];
        let paramIndex = 1;

        // Status filter
        if (filters.status) {
            query += ` AND p.status = $${paramIndex}`;
            values.push(filters.status);
            paramIndex++;
        } else {
            // Default: only show available products
            query += ` AND p.status = 'AVAILABLE'`;
        }

        // Category filter
        if (filters.category) {
            query += ` AND p.category = $${paramIndex}`;
            values.push(filters.category);
            paramIndex++;
        }

        // Location filters
        if (filters.barangay) {
            query += ` AND u.barangay = $${paramIndex}`;
            values.push(filters.barangay);
            paramIndex++;
        }

        // Price range filters
        if (filters.minPrice) {
            query += ` AND p.price >= $${paramIndex}`;
            values.push(parseFloat(filters.minPrice));
            paramIndex++;
        }

        if (filters.maxPrice) {
            query += ` AND p.price <= $${paramIndex}`;
            values.push(parseFloat(filters.maxPrice));
            paramIndex++;
        }

        // Farmer verification filter (only show verified farmers' products)
        query += ` AND f.verified_status = true`;

        // Sorting
        let orderBy = 'p.created_at DESC';
        if (filters.sortBy) {
            switch(filters.sortBy) {
                case 'price_asc':
                    orderBy = 'p.price ASC';
                    break;
                case 'price_desc':
                    orderBy = 'p.price DESC';
                    break;
                case 'newest':
                    orderBy = 'p.created_at DESC';
                    break;
                case 'oldest':
                    orderBy = 'p.created_at ASC';
                    break;
                case 'views':
                    orderBy = 'view_count DESC';
                    break;
                default:
                    orderBy = 'p.created_at DESC';
            }
        }
        query += ` ORDER BY ${orderBy}`;

        // Pagination
        if (filters.limit) {
            query += ` LIMIT $${paramIndex}`;
            values.push(parseInt(filters.limit));
            paramIndex++;
            
            if (filters.offset) {
                query += ` OFFSET $${paramIndex}`;
                values.push(parseInt(filters.offset));
            }
        }

        return await db.query(query, values);
    }

    // Update product
    static async update(product_id, updateData) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        // Build dynamic update query
        for (const [key, value] of Object.entries(updateData)) {
            // Only allow certain fields to be updated
            const allowedFields = [
                'product_name', 'category', 'price', 'harvest_date', 
                'description', 'image_url', 'status'
            ];
            
            if (allowedFields.includes(key)) {
                fields.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        // Add updated_at timestamp
        fields.push('updated_at = CURRENT_TIMESTAMP');

        // Add product_id to values
        values.push(product_id);

        const query = `
            UPDATE products 
            SET ${fields.join(', ')}
            WHERE product_id = $${paramIndex}
            RETURNING *
        `;

        return await db.query(query, values);
    }

    // Update product status only
    static async updateStatus(product_id, status) {
        const query = `
            UPDATE products 
            SET status = $1, updated_at = CURRENT_TIMESTAMP
            WHERE product_id = $2
            RETURNING *
        `;
        return await db.query(query, [status, product_id]);
    }

    // Delete product (soft delete by updating status)
    static async delete(product_id) {
        const query = `
            UPDATE products 
            SET status = 'UNAVAILABLE', updated_at = CURRENT_TIMESTAMP
            WHERE product_id = $1
            RETURNING *
        `;
        return await db.query(query, [product_id]);
    }

    // Record product view
    static async recordProductView(customer_id, product_id) {
        const query = `
            INSERT INTO product_views (customer_id, product_id)
            VALUES ($1, $2)
            ON CONFLICT (customer_id, product_id) 
            DO UPDATE SET 
                view_count = product_views.view_count + 1,
                last_viewed_at = CURRENT_TIMESTAMP
        `;
        return await db.query(query, [customer_id, product_id]);
    }

    // Get product views count
    static async getProductViews(product_id) {
        const query = `
            SELECT COUNT(*) as total_views
            FROM product_views
            WHERE product_id = $1
        `;
        return await db.query(query, [product_id]);
    }

    // Get popular products (most viewed)
    static async getPopularProducts(limit = 10) {
        const query = `
            SELECT 
                p.*,
                f.farm_name,
                u.full_name as farmer_name,
                u.barangay,
                COUNT(pv.view_id) as view_count
            FROM products p
            JOIN farmers f ON p.farmer_id = f.farmer_id
            JOIN users u ON f.user_id = u.user_id
            LEFT JOIN product_views pv ON p.product_id = pv.product_id
            WHERE p.status = 'AVAILABLE'
            AND f.verified_status = true
            GROUP BY p.product_id, f.farm_name, u.full_name, u.barangay
            ORDER BY view_count DESC
            LIMIT $1
        `;
        return await db.query(query, [limit]);
    }

    // Get products by category with count
    static async getProductsByCategory(category, limit = 20) {
        const query = `
            SELECT 
                p.*,
                f.farm_name,
                u.full_name as farmer_name,
                u.barangay
            FROM products p
            JOIN farmers f ON p.farmer_id = f.farmer_id
            JOIN users u ON f.user_id = u.user_id
            WHERE p.category = $1
            AND p.status = 'AVAILABLE'
            AND f.verified_status = true
            ORDER BY p.created_at DESC
            LIMIT $2
        `;
        return await db.query(query, [category, limit]);
    }

    // Search products
    static async searchProducts(searchTerm, filters = {}) {
        let query = `
            SELECT 
                p.*,
                f.farm_name,
                u.full_name as farmer_name,
                u.barangay,
                (
                    SELECT COUNT(*) 
                    FROM product_views pv 
                    WHERE pv.product_id = p.product_id
                ) as view_count,
                -- Calculate relevance score
                CASE 
                    WHEN p.product_name ILIKE $1 THEN 3
                    WHEN p.description ILIKE $1 THEN 2
                    WHEN p.category ILIKE $1 THEN 1
                    ELSE 0
                END as relevance_score
            FROM products p
            JOIN farmers f ON p.farmer_id = f.farmer_id
            JOIN users u ON f.user_id = u.user_id
            WHERE (
                p.product_name ILIKE $1 
                OR p.description ILIKE $1 
                OR p.category ILIKE $1
                OR f.farm_name ILIKE $1
                OR u.barangay ILIKE $1
            )
            AND p.status = 'AVAILABLE'
            AND f.verified_status = true
        `;

        const values = [`%${searchTerm}%`];
        let paramIndex = 2;

        // Additional filters
        if (filters.category) {
            query += ` AND p.category = $${paramIndex}`;
            values.push(filters.category);
            paramIndex++;
        }

        if (filters.minPrice) {
            query += ` AND p.price >= $${paramIndex}`;
            values.push(parseFloat(filters.minPrice));
            paramIndex++;
        }

        if (filters.maxPrice) {
            query += ` AND p.price <= $${paramIndex}`;
            values.push(parseFloat(filters.maxPrice));
            paramIndex++;
        }

        // Order by relevance then date
        query += ` ORDER BY relevance_score DESC, p.created_at DESC`;

        // Limit results
        if (filters.limit) {
            query += ` LIMIT $${paramIndex}`;
            values.push(parseInt(filters.limit));
        }

        return await db.query(query, values);
    }

    // Get product statistics for farmer dashboard
    static async getFarmerStatistics(farmer_id) {
        const query = `
            SELECT 
                COUNT(*) as total_products,
                COUNT(CASE WHEN status = 'AVAILABLE' THEN 1 END) as available_products,
                COUNT(CASE WHEN status = 'UNAVAILABLE' THEN 1 END) as unavailable_products,
                COALESCE(SUM(pv.view_count), 0) as total_views,
                COALESCE(AVG(p.price), 0) as average_price,
                MIN(p.created_at) as first_product_date,
                MAX(p.created_at) as latest_product_date
            FROM products p
            LEFT JOIN (
                SELECT product_id, COUNT(*) as view_count
                FROM product_views
                GROUP BY product_id
            ) pv ON p.product_id = pv.product_id
            WHERE p.farmer_id = $1
            GROUP BY p.farmer_id
        `;
        return await db.query(query, [farmer_id]);
    }

    // Get products with pagination
    static async getProductsWithPagination(page = 1, limit = 10, filters = {}) {
        const offset = (page - 1) * limit;
        
        // Get products
        const productsQuery = `
            SELECT 
                p.*,
                f.farm_name,
                u.full_name as farmer_name,
                u.barangay
            FROM products p
            JOIN farmers f ON p.farmer_id = f.farmer_id
            JOIN users u ON f.user_id = u.user_id
            WHERE p.status = 'AVAILABLE'
            AND f.verified_status = true
            ORDER BY p.created_at DESC
            LIMIT $1 OFFSET $2
        `;
        
        // Get total count
        const countQuery = `
            SELECT COUNT(*) as total_count
            FROM products p
            JOIN farmers f ON p.farmer_id = f.farmer_id
            WHERE p.status = 'AVAILABLE'
            AND f.verified_status = true
        `;

        const [productsResult, countResult] = await Promise.all([
            db.query(productsQuery, [limit, offset]),
            db.query(countQuery)
        ]);

        return {
            products: productsResult.rows,
            total: parseInt(countResult.rows[0].total_count),
            page: page,
            limit: limit,
            totalPages: Math.ceil(countResult.rows[0].total_count / limit)
        };
    }

    // Check if product belongs to farmer (for authorization)
    static async isProductOwner(product_id, farmer_id) {
        const query = `
            SELECT 1 FROM products 
            WHERE product_id = $1 AND farmer_id = $2
        `;
        const result = await db.query(query, [product_id, farmer_id]);
        return result.rows.length > 0;
    }
}

module.exports = Product;