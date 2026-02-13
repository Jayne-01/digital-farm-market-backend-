const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');

// POST /api/orders - Create a new order
router.post('/', authenticateToken, async (req, res) => {
    try {
        await orderController.createOrder(req, res);
    } catch (error) {
        console.error('Route error - create order:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/orders/customer - Get all orders for logged-in customer
router.get('/customer', authenticateToken, async (req, res) => {
    try {
        await orderController.getCustomerOrders(req, res);
    } catch (error) {
        console.error('Route error - get customer orders:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/orders/farmer - Get all orders for logged-in farmer
router.get('/farmer', authenticateToken, async (req, res) => {
    try {
        await orderController.getFarmerOrders(req, res);
    } catch (error) {
        console.error('Route error - get farmer orders:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


// GET /api/orders/:id - Get specific order by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        await orderController.getOrderById(req, res);
    } catch (error) {
        console.error('Route error - get order by ID:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// PUT /api/orders/:id/status - Update order status
router.put('/:id/status', authenticateToken, async (req, res) => {
    try {
        await orderController.updateOrderStatus(req, res);
    } catch (error) {
        console.error('Route error - update order status:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/orders/:id/items - Get items for specific order (Alternative endpoint)
router.get('/:id/items', authenticateToken, async (req, res) => {
    try {
        const order_id = req.params.id;
        const Order = require('../models/orderModel');
        
        // First, get order to check authorization
        const orderResult = await Order.findById(order_id);
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];
        
        // Verify authorization
        const isCustomer = order.customer_id === req.user.user_id;
        const farmerResult = await require('../models/farmerModel').findByUserId(req.user.user_id);
        const isFarmer = farmerResult.rows.length > 0 && 
                        farmerResult.rows[0].farmer_id === order.farmer_id;
        const isAdmin = req.user.role === 'ADMIN';

        if (!isCustomer && !isFarmer && !isAdmin) {
            return res.status(403).json({ error: 'Not authorized to view this order' });
        }

        const itemsResult = await Order.getOrderItems(order_id);
        
        res.json({
            order_id: order.order_id,
            items: itemsResult.rows
        });
    } catch (error) {
        console.error('Route error - get order items:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;