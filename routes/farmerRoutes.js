const express = require('express');
const router = express.Router();
const farmerController = require('../controllers/farmerController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

// Apply authentication middleware to all farmer routes
console.log('Farmer routes loaded - checking role: FARMER');
router.use(authenticateToken);
router.use(authorizeRole('FARMER'));

// GET /api/farmers/dashboard - Get farmer dashboard data
router.get('/dashboard', async (req, res) => {
    try {
        await farmerController.getFarmerDashboard(req, res);
    } catch (error) {
        console.error('Farmer dashboard route error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// PUT /api/farmers/profile - Update farmer profile
router.put('/profile', async (req, res) => {
    try {
        const { farm_name, barangay, product_categories } = req.body;
        
        // Validation
        if (!farm_name && !barangay && !product_categories) {
            return res.status(400).json({ 
                message: 'At least one field is required for update: farm_name, barangay, or product_categories' 
            });
        }

        if (farm_name && farm_name.trim().length < 2) {
            return res.status(400).json({ 
                message: 'Farm name must be at least 2 characters long' 
            });
        }

        if (product_categories && (!Array.isArray(product_categories) || product_categories.length === 0)) {
            return res.status(400).json({ 
                message: 'Product categories must be a non-empty array' 
            });
        }

        await farmerController.updateFarmerProfile(req, res);
    } catch (error) {
        console.error('Update farmer profile route error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/farmers/sales-report - Get sales report
router.get('/sales-report', async (req, res) => {
    try {
        const { period } = req.query;
        
        // Validate period parameter if provided
        if (period && !['weekly', 'monthly', 'yearly'].includes(period)) {
            return res.status(400).json({ 
                message: 'Invalid period. Must be: weekly, monthly, or yearly' 
            });
        }

        await farmerController.getFarmerSalesReport(req, res);
    } catch (error) {
        console.error('Sales report route error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/farmers/inventory - Get farmer inventory
router.get('/inventory', async (req, res) => {
    try {
        const { category, status, sortBy, sortOrder } = req.query;
        
        // Validate sortBy parameter if provided
        const validSortFields = ['created_at', 'product_name', 'price', 'quantity', 'updated_at'];
        if (sortBy && !validSortFields.includes(sortBy)) {
            return res.status(400).json({ 
                message: `Invalid sort field. Must be one of: ${validSortFields.join(', ')}` 
            });
        }

        // Validate sortOrder parameter if provided
        if (sortOrder && !['ASC', 'DESC'].includes(sortOrder.toUpperCase())) {
            return res.status(400).json({ 
                message: 'Invalid sort order. Must be: ASC or DESC' 
            });
        }

        await farmerController.getFarmerInventory(req, res);
    } catch (error) {
        console.error('Inventory route error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/farmers/reviews - Get customer reviews
router.get('/reviews', async (req, res) => {
    try {
        const { minRating, productId } = req.query;
        
        // Validate minRating parameter if provided
        if (minRating) {
            const rating = parseInt(minRating);
            if (isNaN(rating) || rating < 1 || rating > 5) {
                return res.status(400).json({ 
                    message: 'Rating must be a number between 1 and 5' 
                });
            }
        }

        // Validate productId parameter if provided
        if (productId && isNaN(parseInt(productId))) {
            return res.status(400).json({ 
                message: 'Product ID must be a valid number' 
            });
        }

        await farmerController.getFarmerCustomerReviews(req, res);
    } catch (error) {
        console.error('Reviews route error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/farmers/performance - Get performance metrics
router.get('/performance', async (req, res) => {
    try {
        await farmerController.getFarmerPerformanceMetrics(req, res);
    } catch (error) {
        console.error('Performance metrics route error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;