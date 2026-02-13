const Recommendation = require('../models/recommendationModel');
const Product = require('../models/productModel');

const getMarketInsights = async (req, res) => {
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
};

const getCustomerPreferences = async (req, res) => {
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
};

const getSeasonalRecommendations = async (req, res) => {
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
};

const getPersonalizedRecommendations = async (req, res) => {
    try {
        const userId = req.user.user_id;
        
        const customerQuery = `SELECT customer_id FROM customers WHERE user_id = $1`;
        const customerResult = await db.query(customerQuery, [userId]);
        
        if (customerResult.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a registered customer' });
        }
        
        const customer_id = customerResult.rows[0].customer_id;
        
        const [viewedResult, similarResult, trendingResult] = 
            await Recommendation.getPersonalizedRecommendations(customer_id);

        res.json({
            recently_viewed: viewedResult.rows,
            similar_products: similarResult.rows,
            trending_products: trendingResult.rows
        });
    } catch (error) {
        console.error('Get personalized recommendations error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getDemandAnalysis = async (req, res) => {
    try {
        // This implements the demand scoring function 
        const farmerResult = await require('../models/farmerModel').findByUserId(req.user.user_id);
        if (farmerResult.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a registered farmer' });
        }

        const farmer_id = farmerResult.rows[0].farmer_id;
        
        // Demand scoring query 
        const result = await Recommendation.getDemandAnalysis(farmer_id);
        
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
};

module.exports = {
    getMarketInsights,
    getCustomerPreferences,
    getSeasonalRecommendations,
    getPersonalizedRecommendations,
    getDemandAnalysis
};