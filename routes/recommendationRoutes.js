const express = require('express');
const router = express.Router(); 
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const Recommendation = require('../models/recommendationModel');
const db = require('../config/database');

// GET /api/recommendations/market-insights
router.get('/market-insights', authenticateToken, authorizeRole('FARMER'), async (req, res) => {
    try {
        const farmerResult = await require('../models/farmerModel').findByUserId(req.user.user_id);
        if (farmerResult.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a registered farmer' });
        }

        const farmer_id = farmerResult.rows[0].farmer_id;
        const insights = await Recommendation.getMarketInsights(farmer_id);
        
        res.json({
            insights: insights.rows,
            farmer_id
        });
    } catch (error) {
        console.error('Get market insights error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/recommendations/customer-preferences
router.get('/customer-preferences', authenticateToken, async (req, res) => {
    try {
        const preferences = await Recommendation.getCustomerPreferences();
        
        res.json({
            preferences: preferences.rows,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Get customer preferences error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/recommendations/seasonal
router.get('/seasonal', authenticateToken, async (req, res) => {
    try {
        const recommendations = await Recommendation.getSeasonalRecommendations();
        
        res.json({
            recommendations: recommendations.rows,
            current_month: new Date().getMonth() + 1
        });
    } catch (error) {
        console.error('Get seasonal recommendations error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

 // GET /api/recommendations/personalized
router.get('/personalized', authenticateToken, authorizeRole('CUSTOMER'), async (req, res) => {
    try {
        const userId = req.user.user_id;
        
        // Verify user exists and has CUSTOMER role
        const userQuery = `SELECT user_id, role FROM users WHERE user_id = $1 AND role = 'CUSTOMER'`;
        const userResult = await db.query(userQuery, [userId]);
        
        if (userResult.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a registered customer' });
        }
        
        // Use the user_id directly - it will be passed to the customer_id parameter in the query
        const [viewedResult, similarResult, trendingResult] = 
            await Recommendation.getPersonalizedRecommendations(userId);

        res.json({
            recently_viewed: viewedResult.rows,
            similar_products: similarResult.rows,
            trending_products: trendingResult.rows
        });
    } catch (error) {
        console.error('Get personalized recommendations error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// GET /api/recommendations/demand-analysis
router.get('/demand-analysis', authenticateToken, authorizeRole('FARMER'), async (req, res) => {
    try {
        // This implements the demand scoring function from your paper
        const farmerResult = await require('../models/farmerModel').findByUserId(req.user.user_id);
        if (farmerResult.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a registered farmer' });
        }

        const farmer_id = farmerResult.rows[0].farmer_id;
        
        // Demand scoring query based on your paper's formula
        const demandQuery = `
            WITH product_metrics AS (
                SELECT 
                    p.product_id,
                    p.product_name,
                    p.category,
                    COUNT(DISTINCT pv.view_id) as freq_c,
                    CASE 
                        WHEN COUNT(DISTINCT oi.order_item_id) > 0 THEN 1.0
                        ELSE 0.5
                    END as price_trend_c,
                    COUNT(CASE WHEN o.order_status = 'PENDING' THEN 1 END) as unmet_demand_c
                FROM products p
                LEFT JOIN product_views pv ON p.product_id = pv.product_id
                LEFT JOIN order_items oi ON p.product_id = oi.product_id
                LEFT JOIN orders o ON oi.order_id = o.order_id
                WHERE p.farmer_id = $1
                AND p.status = 'AVAILABLE'
                GROUP BY p.product_id, p.product_name, p.category
            )
            SELECT 
                *,
                ROUND(
                    (freq_c * 0.4) + 
                    (price_trend_c * 0.3) + 
                    (unmet_demand_c * 0.3),
                    2
                ) as demand_score
            FROM product_metrics
            ORDER BY demand_score DESC
        `;

        const result = await db.query(demandQuery, [farmer_id]);
        
        res.json({
            demand_analysis: result.rows,
            weights: {
                frequency: 0.4,
                price_trend: 0.3,
                unmet_demand: 0.3
            }
        });
    } catch (error) {
        console.error('Get demand analysis error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;