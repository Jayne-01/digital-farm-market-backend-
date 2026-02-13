const Order = require('../models/orderModel');
const Product = require('../models/productModel');

const createOrder = async (req, res) => {
    try {
        const { items, delivery_option } = req.body;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Order items are required' });
        }

        // Validate delivery option
        const validDeliveryOptions = ['Pick-Up', 'Home Delivery'];
        if (delivery_option && !validDeliveryOptions.includes(delivery_option)) {
            return res.status(400).json({ 
                error: 'Invalid delivery option. Must be either "Pick-Up" or "Home Delivery"' 
            });
        }

        // Validate all products exist and belong to the same farmer
        let farmer_id = null;
        let total_amount = 0;
        const productUpdates = [];

        for (const item of items) {
            const productResult = await Product.findById(item.product_id);
            if (productResult.rows.length === 0) {
                return res.status(404).json({ error: `Product ${item.product_id} not found` });
            }

            const product = productResult.rows[0];
            
            // Check stock
            if (product.quantity < item.quantity) {
                return res.status(400).json({ 
                    error: `Insufficient stock for ${product.product_name}` 
                });
            }

            // Verify all items are from the same farmer
            if (farmer_id === null) {
                farmer_id = product.farmer_id;
            } else if (farmer_id !== product.farmer_id) {
                return res.status(400).json({ 
                    error: 'All items must be from the same farmer' 
                });
            }

            // Calculate item total
            const itemTotal = product.price * item.quantity;
            total_amount += itemTotal;

            // Track products to update
            productUpdates.push({
                product_id: product.product_id,
                new_quantity: product.quantity - item.quantity
            });
        }

        // Set default delivery option if not provided
        const finalDeliveryOption = delivery_option || 'Home Delivery'; // Default to Home Delivery

        // Create order
        const orderData = {
            customer_id: req.user.user_id,
            farmer_id,
            total_amount,
            delivery_option: finalDeliveryOption
        };

        const orderResult = await Order.create(orderData);
        const order = orderResult.rows[0];

        // Add order items and update product quantities
        for (const item of items) {
            const productResult = await Product.findById(item.product_id);
            const product = productResult.rows[0];
            
            await Order.addOrderItem(order.order_id, {
                product_id: item.product_id,
                quantity: item.quantity,
                price: product.price
            });

            // Update product quantity
            const update = productUpdates.find(p => p.product_id === item.product_id);
            await Product.update(item.product_id, { quantity: update.new_quantity });
            
            // If quantity becomes 0, mark as unavailable
            if (update.new_quantity === 0) {
                await Product.update(item.product_id, { status: 'UNAVAILABLE' });
            }
        }

        res.status(201).json({
            message: 'Order created successfully',
            order
        });
    } catch (error) {
        console.error('Create order error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getCustomerOrders = async (req, res) => {
    try {
        const result = await Order.findByCustomer(req.user.user_id);
        
        // Get items for each order
        const orders = await Promise.all(result.rows.map(async (order) => {
            const itemsResult = await Order.getOrderItems(order.order_id);
            return {
                ...order,
                items: itemsResult.rows
            };
        }));

        res.json({
            orders
        });
    } catch (error) {
        console.error('Get customer orders error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getFarmerOrders = async (req, res) => {
    try {
        const farmerResult = await require('../models/farmerModel').findByUserId(req.user.user_id);
        if (farmerResult.rows.length === 0) {
            return res.status(403).json({ error: 'User is not a registered farmer' });
        }

        const farmer_id = farmerResult.rows[0].farmer_id;
        const result = await Order.findByFarmer(farmer_id);
        
        // Get items for each order
        const orders = await Promise.all(result.rows.map(async (order) => {
            const itemsResult = await Order.getOrderItems(order.order_id);
            return {
                ...order,
                items: itemsResult.rows
            };
        }));

        res.json({
            orders
        });
    } catch (error) {
        console.error('Get farmer orders error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const getOrderById = async (req, res) => {
    try {
        const order_id = req.params.id;
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
            order: {
                ...order,
                items: itemsResult.rows
            }
        });
    } catch (error) {
        console.error('Get order by ID error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const order_id = req.params.id;
        const { status } = req.body;

        const validStatuses = ['PENDING', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const orderResult = await Order.findById(order_id);
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const order = orderResult.rows[0];
        
        // Verify authorization (only farmer or admin can update status)
        const farmerResult = await require('../models/farmerModel').findByUserId(req.user.user_id);
        const isFarmer = farmerResult.rows.length > 0 && 
                        farmerResult.rows[0].farmer_id === order.farmer_id;
        const isAdmin = req.user.role === 'ADMIN';

        if (!isFarmer && !isAdmin) {
            return res.status(403).json({ error: 'Not authorized to update order status' });
        }

        const result = await Order.updateStatus(order_id, status);
        res.json({
            message: 'Order status updated successfully',
            order: result.rows[0]
        });
    } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

module.exports = {
    createOrder,
    getCustomerOrders,
    getFarmerOrders,
    getOrderById,
    updateOrderStatus
};