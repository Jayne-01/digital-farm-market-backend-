// adminRoutes.js
const express = require('express');
const router = express.Router();
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

// ========== USER MANAGEMENT ==========

// GET /api/admin/users
router.get('/users', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.getAllUsers(req, res);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/admin/users/:id
router.get('/users/:id', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.getUserDetails(req, res);
    } catch (error) {
        console.error('Get user details error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// PATCH /api/admin/users/:id/status
router.patch('/users/:id/status', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.updateUserStatus(req, res);
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// PATCH /api/admin/users/:id/role
router.patch('/users/:id/role', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.updateUserRole(req, res);
    } catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========== FARMER MANAGEMENT ==========

// GET /api/admin/farmers/pending-verifications
router.get('/farmers/pending-verifications', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.getPendingVerifications(req, res);
    } catch (error) {
        console.error('Get pending verifications error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// PATCH /api/admin/farmers/:id/verify
router.patch('/farmers/:id/verify', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.verifyFarmer(req, res);
    } catch (error) {
        console.error('Verify farmer error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========== PRODUCT MANAGEMENT ==========

// GET /api/admin/products
router.get('/products', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.getAllProducts(req, res);
    } catch (error) {
        console.error('Get all products error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// PATCH /api/admin/products/:id/status
router.patch('/products/:id/status', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.updateProductStatus(req, res);
    } catch (error) {
        console.error('Update product status error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========== ORDER MANAGEMENT ==========

// GET /api/admin/orders
router.get('/orders', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.getAllOrders(req, res);
    } catch (error) {
        console.error('Get all orders error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// PATCH /api/admin/orders/:id
router.patch('/orders/:id', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.updateOrder(req, res);
    } catch (error) {
        console.error('Update order error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========== SYSTEM ANALYTICS ==========

// GET /api/admin/analytics
router.get('/analytics', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.getSystemAnalytics(req, res);
    } catch (error) {
        console.error('Get system analytics error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========== SYSTEM SETTINGS ==========

// GET /api/admin/settings/logs
router.get('/settings/logs', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.getSystemLogs(req, res);
    } catch (error) {
        console.error('Get system logs error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// PUT /api/admin/settings
router.put('/settings', authenticateToken, authorizeRole('ADMIN'), async (req, res) => {
    try {
        await adminController.updateSystemSettings(req, res);
    } catch (error) {
        console.error('Update system settings error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;