const Product = require('../models/productModel');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Create pool connection
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'digital_market',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

// Helper function to get full image URL
const getFullImageUrl = (req, imageUrl) => {
    if (!imageUrl) return '';
    if (imageUrl.startsWith('http')) return imageUrl;
    return `${req.protocol}://${req.get('host')}${imageUrl}`;
};

// Create product with image upload
const createProduct = async (req, res) => {
    try {
        const { product_name, category, price, harvest_date, description } = req.body;
        
        // Validation
        if (!product_name || !category || !price) {
            // Delete uploaded file if validation fails
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({ 
                success: false,
                error: 'Product name, category, and price are required' 
            });
        }

        // Get user_id from authenticated user
        const user_id = req.user.user_id;

        // Check if user has farmer profile
        const farmerCheck = await pool.query(
            'SELECT farmer_id, user_id, farm_name, barangay, verified_status FROM farmers WHERE user_id = $1',
            [user_id]
        );
        
        if (farmerCheck.rows.length === 0) {
            // Delete uploaded file if not a farmer
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(403).json({ 
                success: false,
                error: 'You need to register as a farmer first to list products' 
            });
        }
        
        // Check if farmer is verified
        if (!farmerCheck.rows[0].verified_status) {
            // Delete uploaded file if not verified
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(403).json({ 
                success: false,
                error: 'Your farmer account is pending verification' 
            });
        }
        
        const farmer_id = farmerCheck.rows[0].farmer_id;

        // Handle image URL
        let image_url = '';
        if (req.file) {
            // Store relative path
            image_url = `/uploads/products/${req.file.filename}`;
        }

        const productData = {
            farmer_id,
            product_name,
            category,
            price: parseFloat(price),
            harvest_date: harvest_date || null,
            description: description || '',
            image_url: image_url || '',
            status: 'AVAILABLE'
        };

        const result = await Product.create(productData);
        
        // Convert image URL to absolute for response
        let product = result.rows[0];
        product.image_url = getFullImageUrl(req, product.image_url);
        
        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            product: product,
            farmer_info: {
                farm_name: farmerCheck.rows[0].farm_name,
                barangay: farmerCheck.rows[0].barangay
            }
        });
        
    } catch (error) {
        // Clean up uploaded file on error
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        
        console.error('Create product error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get farmer's own products
const getFarmerProducts = async (req, res) => {
    try {
        // Get user_id from authenticated user
        const user_id = req.user.user_id;

        // Check if user has farmer profile
        const farmerCheck = await pool.query(
            'SELECT farmer_id FROM farmers WHERE user_id = $1',
            [user_id]
        );
        
        if (farmerCheck.rows.length === 0) {
            return res.status(403).json({ 
                success: false,
                error: 'You need to register as a farmer first to view your products' 
            });
        }
        
        const farmer_id = farmerCheck.rows[0].farmer_id;

        const result = await Product.findByFarmer(farmer_id);
        
        // Convert image URLs
        const products = result.rows.map(product => {
            product.image_url = getFullImageUrl(req, product.image_url);
            return product;
        });
        
        res.json({
            success: true,
            products: products,
            count: products.length
        });
    } catch (error) {
        console.error('Get farmer products error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get all products (public)
const getAllProducts = async (req, res) => {
    try {
        const filters = {
            category: req.query.category,
            barangay: req.query.barangay,
            minPrice: req.query.minPrice,
            maxPrice: req.query.maxPrice,
            status: req.query.status || 'AVAILABLE'
        };

        const result = await Product.getAllProducts(filters);
        
        // Convert image URLs
        const products = result.rows.map(product => {
            product.image_url = getFullImageUrl(req, product.image_url);
            return product;
        });
        
        res.json({
            success: true,
            products: products,
            count: products.length
        });
    } catch (error) {
        console.error('Get all products error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get product by ID (public)
const getProductById = async (req, res) => {
    try {
        const product_id = req.params.id;
        const result = await Product.findById(product_id);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Product not found' 
            });
        }

        // Convert image URL
        let product = result.rows[0];
        product.image_url = getFullImageUrl(req, product.image_url);

        // Record product view if user is a customer
        if (req.user && req.user.role === 'CUSTOMER') {
            try {
                await Product.recordProductView(req.user.user_id, product_id);
            } catch (viewError) {
                console.error('Error recording product view:', viewError);
                // Don't fail the request if view recording fails
            }
        }

        res.json({
            success: true,
            product: product
        });
    } catch (error) {
        console.error('Get product by ID error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Update product with optional image
const updateProduct = async (req, res) => {
    try {
        const product_id = req.params.id;
        const updateData = req.body;

        // Check if product exists
        const productResult = await Product.findById(product_id);
        if (productResult.rows.length === 0) {
            // Delete uploaded file if product doesn't exist
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(404).json({ 
                success: false,
                error: 'Product not found' 
            });
        }

        // Get user_id from authenticated user
        const user_id = req.user.user_id;

        // Check if user has farmer profile
        const farmerCheck = await pool.query(
            'SELECT farmer_id FROM farmers WHERE user_id = $1',
            [user_id]
        );
        
        if (farmerCheck.rows.length === 0) {
            // Delete uploaded file if not a farmer
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(403).json({ 
                success: false,
                error: 'You need to register as a farmer first to update products' 
            });
        }
        
        const farmer_id = farmerCheck.rows[0].farmer_id;
        
        // Verify product ownership
        if (productResult.rows[0].farmer_id !== farmer_id) {
            // Delete uploaded file if not authorized
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(403).json({ 
                success: false,
                error: 'You are not authorized to update this product' 
            });
        }

        // Handle new image upload
        if (req.file) {
            // Delete old image if exists
            if (productResult.rows[0].image_url) {
                const oldImagePath = path.join(__dirname, '..', productResult.rows[0].image_url);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
            // Add new image path to update data
            updateData.image_url = `/uploads/products/${req.file.filename}`;
        }

        // Convert numeric field if present
        if (updateData.price) updateData.price = parseFloat(updateData.price);

        const result = await Product.update(product_id, updateData);
        
        // Convert image URL for response
        let product = result.rows[0];
        product.image_url = getFullImageUrl(req, product.image_url);
        
        res.json({
            success: true,
            message: 'Product updated successfully',
            product: product
        });
    } catch (error) {
        // Clean up uploaded file on error
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        
        console.error('Update product error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Update product status only
const updateProductStatus = async (req, res) => {
    try {
        const product_id = req.params.id;
        const { status } = req.body;

        if (!['AVAILABLE', 'UNAVAILABLE'].includes(status)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid status value. Must be AVAILABLE or UNAVAILABLE' 
            });
        }

        // Check if product exists
        const productResult = await Product.findById(product_id);
        if (productResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Product not found' 
            });
        }

        // Get user_id from authenticated user
        const user_id = req.user.user_id;

        // Check if user has farmer profile
        const farmerCheck = await pool.query(
            'SELECT farmer_id FROM farmers WHERE user_id = $1',
            [user_id]
        );
        
        if (farmerCheck.rows.length === 0) {
            return res.status(403).json({ 
                success: false,
                error: 'You need to register as a farmer first to update product status' 
            });
        }
        
        const farmer_id = farmerCheck.rows[0].farmer_id;
        
        // Verify product ownership
        if (productResult.rows[0].farmer_id !== farmer_id) {
            return res.status(403).json({ 
                success: false,
                error: 'You are not authorized to update this product' 
            });
        }

        const result = await Product.updateStatus(product_id, status);
        
        res.json({
            success: true,
            message: `Product status updated to ${status}`,
            product: result.rows[0]
        });
    } catch (error) {
        console.error('Update product status error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Delete product (soft delete)
const deleteProduct = async (req, res) => {
    try {
        const product_id = req.params.id;

        // Check if product exists
        const productResult = await Product.findById(product_id);
        if (productResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Product not found' 
            });
        }

        // Get user_id from authenticated user
        const user_id = req.user.user_id;

        // Check if user has farmer profile
        const farmerCheck = await pool.query(
            'SELECT farmer_id FROM farmers WHERE user_id = $1',
            [user_id]
        );
        
        if (farmerCheck.rows.length === 0) {
            return res.status(403).json({ 
                success: false,
                error: 'You need to register as a farmer first to delete products' 
            });
        }
        
        const farmer_id = farmerCheck.rows[0].farmer_id;
        
        // Verify product ownership
        if (productResult.rows[0].farmer_id !== farmer_id) {
            return res.status(403).json({ 
                success: false,
                error: 'You are not authorized to delete this product' 
            });
        }

        // Delete the image file if exists
        if (productResult.rows[0].image_url) {
            const imagePath = path.join(__dirname, '..', productResult.rows[0].image_url);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        // Soft delete by updating status
        await Product.updateStatus(product_id, 'UNAVAILABLE');
        
        res.json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('Delete product error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Update product image only
const updateProductImage = async (req, res) => {
    try {
        const product_id = req.params.id;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No image file provided'
            });
        }

        // Check if product exists
        const productResult = await Product.findById(product_id);
        if (productResult.rows.length === 0) {
            // Delete uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ 
                success: false,
                error: 'Product not found' 
            });
        }

        // Get user_id from authenticated user
        const user_id = req.user.user_id;

        // Check if user has farmer profile
        const farmerCheck = await pool.query(
            'SELECT farmer_id FROM farmers WHERE user_id = $1',
            [user_id]
        );
        
        if (farmerCheck.rows.length === 0) {
            // Delete uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(403).json({ 
                success: false,
                error: 'You need to be a farmer to update product image' 
            });
        }
        
        const farmer_id = farmerCheck.rows[0].farmer_id;
        
        // Verify product ownership
        if (productResult.rows[0].farmer_id !== farmer_id) {
            // Delete uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(403).json({ 
                success: false,
                error: 'You are not authorized to update this product' 
            });
        }

        // Delete old image if exists
        if (productResult.rows[0].image_url) {
            const oldImagePath = path.join(__dirname, '..', productResult.rows[0].image_url);
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }

        // Update with new image
        const newImageUrl = `/uploads/products/${req.file.filename}`;
        const result = await Product.update(product_id, { image_url: newImageUrl });
        
        // Convert URL for response
        let product = result.rows[0];
        product.image_url = getFullImageUrl(req, product.image_url);
        
        res.json({
            success: true,
            message: 'Product image updated successfully',
            product: product
        });
        
    } catch (error) {
        // Clean up uploaded file on error
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        
        console.error('Update product image error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get products by category (public)
const getProductsByCategory = async (req, res) => {
    try {
        const { category } = req.params;
        const filters = {
            category: category,
            status: 'AVAILABLE'
        };

        const result = await Product.getAllProducts(filters);
        
        // Convert image URLs
        const products = result.rows.map(product => {
            product.image_url = getFullImageUrl(req, product.image_url);
            return product;
        });
        
        res.json({
            success: true,
            category: category,
            products: products,
            count: products.length
        });
    } catch (error) {
        console.error('Get products by category error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Search products (public)
const searchProducts = async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }

        const searchQuery = `
            SELECT p.*, f.farm_name, u.full_name as farmer_name, u.barangay
            FROM products p
            JOIN farmers f ON p.farmer_id = f.farmer_id
            JOIN users u ON f.user_id = u.user_id
            WHERE p.status = 'AVAILABLE'
            AND (
                p.product_name ILIKE $1 
                OR p.description ILIKE $1 
                OR p.category ILIKE $1
                OR f.farm_name ILIKE $1
            )
            ORDER BY p.created_at DESC
        `;

        const result = await pool.query(searchQuery, [`%${query}%`]);
        
        // Convert image URLs
        const products = result.rows.map(product => {
            product.image_url = getFullImageUrl(req, product.image_url);
            return product;
        });
        
        res.json({
            success: true,
            search_query: query,
            products: products,
            count: products.length
        });
    } catch (error) {
        console.error('Search products error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    createProduct,
    getFarmerProducts,
    getAllProducts,
    getProductById,
    updateProduct,
    deleteProduct,
    updateProductStatus,
    updateProductImage,
    getProductsByCategory,
    searchProducts
};