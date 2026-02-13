const Farmer = require('../models/farmerModel');
const Product = require('../models/productModel');
const Order = require('../models/orderModel');
const db = require('../config/database'); 

const getFarmerDashboard = async (req, res) => {
    try {
        // Get farmer details
        const farmerResult = await Farmer.findByUserId(req.user.user_id);
        if (farmerResult.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a registered farmer' });
        }

        const farmer = farmerResult.rows[0];
        const farmer_id = farmer.farmer_id;

        // Get farmer statistics
        const statsResult = await Farmer.getFarmerStats(farmer_id);
        
        // Get recent orders
        const recentOrders = await Order.findByFarmer(farmer_id);
        
        // Get unavailable products
        const unavailableQuery = `
            SELECT * FROM products 
            WHERE farmer_id = $1 
            AND status = 'UNAVAILABLE'
            ORDER BY updated_at DESC
            LIMIT 5
        `;
        const unavailableResult = await db.query(unavailableQuery, [farmer_id]);

        // Get recent feedback
        const feedbackResult = await Farmer.getRecentFeedback(farmer_id);

        res.json({
            farmer: {
                farmer_id: farmer.farmer_id,
                farm_name: farmer.farm_name,
                barangay: farmer.barangay,
                product_categories: farmer.product_categories,
                verified_status: farmer.verified_status,
                farmer_rating: farmer.farmer_rating
            },
            statistics: statsResult.rows[0] || {
                total_products: 0,
                total_orders: 0,
                average_rating: 0,
                total_sales: 0
            },
            recent_orders: recentOrders.rows.slice(0, 5),
            unavailable_products: unavailableResult.rows,  //low_stock_products
            recent_feedback: feedbackResult.rows
        });
    } catch (error) {
        console.error('Get farmer dashboard error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const updateFarmerProfile = async (req, res) => {
    try {
        const { farm_name, barangay, product_categories } = req.body;
        
        const farmerResult = await Farmer.findByUserId(req.user.user_id);
        if (farmerResult.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a registered farmer' });
        }

        const farmer_id = farmerResult.rows[0].farmer_id;
        const updateData = {};

        if (farm_name) updateData.farm_name = farm_name;
        if (barangay) updateData.barangay = barangay;
        if (product_categories) updateData.product_categories = product_categories;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No data provided for update' });
        }

        const result = await Farmer.updateFarmerProfile(farmer_id, updateData);
        
        res.json({
            message: 'Farmer profile updated successfully',
            farmer: result.rows[0]
        });
    } catch (error) {
        console.error('Update farmer profile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getFarmerSalesReport = async (req, res) => {
    try {
        const farmerResult = await Farmer.findByUserId(req.user.user_id);
        if (farmerResult.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a registered farmer' });
        }

        const farmer_id = farmerResult.rows[0].farmer_id;
        const { period = 'monthly' } = req.query;

        let dateRange;
        switch (period) {
            case 'weekly':
                dateRange = "CURRENT_DATE - INTERVAL '7 days'";
                break;
            case 'monthly':
                dateRange = "CURRENT_DATE - INTERVAL '30 days'";
                break;
            case 'yearly':
                dateRange = "CURRENT_DATE - INTERVAL '365 days'";
                break;
            default:
                dateRange = "CURRENT_DATE - INTERVAL '30 days'";
        }

        const salesQuery = `
            SELECT 
                DATE(o.order_date) as order_date,
                COUNT(DISTINCT o.order_id) as total_orders,
                SUM(o.total_amount) as total_sales,
                SUM(oi.quantity) as total_items_sold,  // KEEP - order_items has quantity
                AVG(f.rating) as average_rating
            FROM orders o
            JOIN order_items oi ON o.order_id = oi.order_id
            LEFT JOIN feedback f ON oi.product_id = f.product_id
            WHERE o.farmer_id = $1
            AND o.order_date >= ${dateRange}
            AND o.order_status = 'DELIVERED'
            GROUP BY DATE(o.order_date)
            ORDER BY DATE(o.order_date) DESC
        `;

        const productSalesQuery = `
            SELECT 
                p.product_name,
                p.category,
                SUM(oi.quantity) as quantity_sold, 
                SUM(oi.quantity * oi.price) as revenue,  
                AVG(f.rating) as average_rating
            FROM products p
            JOIN order_items oi ON p.product_id = oi.product_id
            JOIN orders o ON oi.order_id = o.order_id
            LEFT JOIN feedback f ON p.product_id = f.product_id
            WHERE p.farmer_id = $1
            AND o.order_date >= ${dateRange}
            AND o.order_status = 'DELIVERED'
            GROUP BY p.product_id, p.product_name, p.category
            ORDER BY revenue DESC
        `;

        const [salesResult, productSalesResult] = await Promise.all([
            db.query(salesQuery, [farmer_id]),
            db.query(productSalesQuery, [farmer_id])
        ]);

        res.json({
            period,
            sales_report: salesResult.rows,
            product_performance: productSalesResult.rows,
            summary: {
                total_sales: salesResult.rows.reduce((sum, row) => sum + parseFloat(row.total_sales || 0), 0),
                total_orders: salesResult.rows.reduce((sum, row) => sum + parseInt(row.total_orders || 0), 0),
                total_items_sold: salesResult.rows.reduce((sum, row) => sum + parseInt(row.total_items_sold || 0), 0)
            }
        });
    } catch (error) {
        console.error('Get farmer sales report error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getFarmerInventory = async (req, res) => {
    try {
        const farmerResult = await Farmer.findByUserId(req.user.user_id);
        if (farmerResult.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a registered farmer' });
        }

        const farmer_id = farmerResult.rows[0].farmer_id;
        const { category, status, sortBy = 'created_at', sortOrder = 'DESC' } = req.query;

        let query = `
            SELECT 
                p.*,
                COUNT(DISTINCT oi.order_item_id) as times_sold,
                COALESCE(AVG(f.rating), 0) as average_rating,
                COUNT(DISTINCT pv.view_id) as view_count
            FROM products p
            LEFT JOIN order_items oi ON p.product_id = oi.product_id
            LEFT JOIN feedback f ON p.product_id = f.product_id
            LEFT JOIN product_views pv ON p.product_id = pv.product_id
            WHERE p.farmer_id = $1
        `;
        
        const values = [farmer_id];
        let paramIndex = 2;

        if (category) {
            query += ` AND p.category = $${paramIndex}`;
            values.push(category);
            paramIndex++;
        }

        if (status) {
            query += ` AND p.status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        query += ` GROUP BY p.product_id ORDER BY p.${sortBy} ${sortOrder}`;
        
        const result = await db.query(query, values);
        
        // Calculate inventory summary (simplified without quantity tracking)
        const summary = {
            total_products: result.rows.length,
            total_available: result.rows.filter(p => p.status === 'AVAILABLE').length,
            total_unavailable: result.rows.filter(p => p.status === 'UNAVAILABLE').length,
            total_value: 0 
        };

        res.json({
            inventory: result.rows,
            summary
        });
    } catch (error) {
        console.error('Get farmer inventory error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getFarmerCustomerReviews = async (req, res) => {
    try {
        const farmerResult = await Farmer.findByUserId(req.user.user_id);
        if (farmerResult.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a registered farmer' });
        }

        const farmer_id = farmerResult.rows[0].farmer_id;
        const { minRating, productId } = req.query;

        let query = `
            SELECT 
                f.feedback_id,
                f.rating,
                f.comment,
                f.created_at,
                p.product_name,
                p.product_id,
                u.full_name as customer_name,
                u.contact_number
            FROM feedback f
            JOIN products p ON f.product_id = p.product_id
            JOIN users u ON f.customer_id = u.user_id
            WHERE p.farmer_id = $1
        `;
        
        const values = [farmer_id];
        let paramIndex = 2;

        if (minRating) {
            query += ` AND f.rating >= $${paramIndex}`;
            values.push(parseInt(minRating));
            paramIndex++;
        }

        if (productId) {
            query += ` AND p.product_id = $${paramIndex}`;
            values.push(parseInt(productId));
            paramIndex++;
        }

        query += ' ORDER BY f.created_at DESC';

        const result = await db.query(query, values);
        
        // Calculate rating statistics
        const ratings = result.rows.map(r => r.rating);
        const ratingStats = {
            average: ratings.length > 0 ? 
                (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : 0,
            total: ratings.length,
            distribution: {
                5: ratings.filter(r => r === 5).length,
                4: ratings.filter(r => r === 4).length,
                3: ratings.filter(r => r === 3).length,
                2: ratings.filter(r => r === 2).length,
                1: ratings.filter(r => r === 1).length
            }
        };

        res.json({
            reviews: result.rows,
            rating_stats: ratingStats
        });
    } catch (error) {
        console.error('Get farmer customer reviews error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getFarmerPerformanceMetrics = async (req, res) => {
    try {
        const farmerResult = await Farmer.findByUserId(req.user.user_id);
        if (farmerResult.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a registered farmer' });
        }

        const farmer_id = farmerResult.rows[0].farmer_id;

        // Performance metrics queries - ADJUSTED for your schema
        const metricsQueries = {
            order_fulfillment: `
                SELECT 
                    order_status,
                    COUNT(*) as count,
                    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
                FROM orders 
                WHERE farmer_id = $1
                GROUP BY order_status
            `,
            // RESPONSE TIME: Using order_date only (since no updated_at)
            // For delivered orders, calculate days since order
            response_time: `
                SELECT 
                    AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - order_date))) / 3600 as avg_response_hours
                FROM orders 
                WHERE farmer_id = $1 
                AND order_status = 'DELIVERED'
            `,
            customer_satisfaction: `
                SELECT 
                    ROUND(AVG(rating), 2) as avg_rating,
                    COUNT(*) as total_reviews
                FROM feedback f
                JOIN products p ON f.product_id = p.product_id
                WHERE p.farmer_id = $1
            `,
            sales_trend: `
                SELECT 
                    DATE_TRUNC('week', order_date) as week,
                    SUM(total_amount) as weekly_sales,
                    COUNT(DISTINCT order_id) as weekly_orders
                FROM orders 
                WHERE farmer_id = $1
                AND order_date >= CURRENT_DATE - INTERVAL '12 weeks'
                GROUP BY DATE_TRUNC('week', order_date)
                ORDER BY week DESC
                LIMIT 12
            `,
            top_products: `
                SELECT 
                    p.product_name,
                    SUM(oi.quantity) as total_sold,
                    SUM(oi.quantity * oi.price) as revenue,
                    COALESCE(AVG(f.rating), 0) as avg_rating
                FROM products p
                JOIN order_items oi ON p.product_id = oi.product_id
                LEFT JOIN feedback f ON p.product_id = f.product_id
                WHERE p.farmer_id = $1
                GROUP BY p.product_id, p.product_name
                ORDER BY revenue DESC
                LIMIT 5
            `
        };

        const results = {};
        for (const [key, query] of Object.entries(metricsQueries)) {
            console.log(`Executing ${key} query:`);
            console.log(query);
            const result = await db.query(query, [farmer_id]);
            results[key] = result.rows;
            console.log(`${key} result:`, result.rows);
        }

        // Calculate overall performance score
        const fulfillmentData = results.order_fulfillment.find(o => o.order_status === 'DELIVERED');
        const responseTimeData = results.response_time[0];
        
        const performanceScore = {
            fulfillment_rate: fulfillmentData?.percentage || 0,
            avg_rating: parseFloat(results.customer_satisfaction[0]?.avg_rating || 0),
            response_time: responseTimeData ? parseFloat(responseTimeData.avg_response_hours) : 24,
            sales_growth: calculateGrowthRate(results.sales_trend)
        };

        console.log('Performance Score Components:', performanceScore);

        const overallScore = (
            (performanceScore.fulfillment_rate * 0.3) +
            (performanceScore.avg_rating * 20 * 0.3) + // Convert 5-star to 100-point scale
            ((72 - Math.min(performanceScore.response_time, 72)) * 0.2) + // Adjusted for longer timeframes
            (Math.min(performanceScore.sales_growth, 100) * 0.2) // Cap growth at 100%
        ).toFixed(1);

        console.log('Overall Score:', overallScore);

        res.json({
            performance_metrics: results,
            performance_score: {
                ...performanceScore,
                overall: overallScore,
                level: getPerformanceLevel(overallScore)
            },
            recommendations: generatePerformanceRecommendations(performanceScore)
        });
    } catch (error) {
        console.error('Get farmer performance metrics error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
const generatePerformanceRecommendations = (metrics) => {
    const recommendations = [];
    
    if (metrics.fulfillment_rate < 90) {
        recommendations.push({
            area: 'Order Fulfillment',
            suggestion: 'Improve delivery time and order accuracy',
            priority: 'HIGH'
        });
    }
    
    if (metrics.avg_rating < 4) {
        recommendations.push({
            area: 'Customer Satisfaction',
            suggestion: 'Check feedback and improve product quality',
            priority: 'HIGH'
        });
    }
    
    // Adjusted for hours/days - if response time > 48 hours (2 days)
    if (metrics.response_time > 48) {
        recommendations.push({
            area: 'Order Processing Time',
            suggestion: 'Process and deliver orders faster',
            priority: 'MEDIUM'
        });
    }
    
    if (metrics.sales_growth < 0) {
        recommendations.push({
            area: 'Sales Growth',
            suggestion: 'Consider promotional offers or new products',
            priority: 'MEDIUM'
        });
    }
    
    return recommendations;
};

const getPerformanceLevel = (score) => {
    const numScore = parseFloat(score);
    if (numScore >= 80) return 'EXCELLENT';
    if (numScore >= 70) return 'GOOD';
    if (numScore >= 60) return 'AVERAGE';
    if (numScore >= 50) return 'NEEDS IMPROVEMENT';
    return 'POOR';
};

const calculateGrowthRate = (salesTrend) => {
    if (!salesTrend || salesTrend.length < 2) return 0;
    const recent = parseFloat(salesTrend[0]?.weekly_sales || 0);
    const previous = parseFloat(salesTrend[1]?.weekly_sales || 0);
    if (previous === 0) return recent > 0 ? 100 : 0; // If no previous sales, growth is 100% if current > 0
    return ((recent - previous) / previous) * 100;
};

module.exports = {
    getFarmerDashboard,
    updateFarmerProfile,
    getFarmerSalesReport,
    getFarmerInventory,
    getFarmerCustomerReviews,
    getFarmerPerformanceMetrics
};