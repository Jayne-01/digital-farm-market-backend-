const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { authenticateToken, authorizeRole } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// POST /api/products - Create product (farmer only)
router.post('/', 
    authenticateToken, authorizeRole('FARMER'),
    upload.single('product_image'),
    async (req, res) => {
        try {
            await productController.createProduct(req, res);
        } catch (error) {
            console.error('Route error - create product:', error);
            res.status(500).json({ 
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// GET /api/products - Get all products (public)
router.get('/', async (req, res) => {
    try {
        await productController.getAllProducts(req, res);
    } catch (error) {
        console.error('Route error - get all products:', error);
        res.status(500).json({ 
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/products/search - Search products (public)
router.get('/search', async (req, res) => {
    try {
        await productController.searchProducts(req, res);
    } catch (error) {
        console.error('Route error - search products:', error);
        res.status(500).json({ 
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/products/category/:category - Get products by category (public)
router.get('/category/:category', async (req, res) => {
    try {
        await productController.getProductsByCategory(req, res);
    } catch (error) {
        console.error('Route error - get products by category:', error);
        res.status(500).json({ 
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /api/products/farmer/products - Get farmer's products (farmer only)
router.get('/farmer/products', 
    authenticateToken, authorizeRole('FARMER'),
    async (req, res) => {
        try {
            await productController.getFarmerProducts(req, res);
        } catch (error) {
            console.error('Route error - get farmer products:', error);
            res.status(500).json({ 
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// GET /api/products/:id - Get product by ID (public)
router.get('/:id', async (req, res) => {
    try {
        await productController.getProductById(req, res);
    } catch (error) {
        console.error('Route error - get product by ID:', error);
        res.status(500).json({ 
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// PUT /api/products/:id - Update product (farmer only)
router.put('/:id',
    authenticateToken, authorizeRole('FARMER'),
    upload.single('product_image'),
    async (req, res) => {
        try {
            await productController.updateProduct(req, res);
        } catch (error) {
            console.error('Route error - update product:', error);
            res.status(500).json({ 
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// PATCH /api/products/:id/status - Update product status (farmer only)
router.patch('/:id/status',
    authenticateToken, authorizeRole('FARMER'),
    async (req, res) => {
        try {
            await productController.updateProductStatus(req, res);
        } catch (error) {
            console.error('Route error - update product status:', error);
            res.status(500).json({ 
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// PATCH /api/products/:id/image - Update product image only (farmer only)
router.patch('/:id/image',
    authenticateToken, authorizeRole('FARMER'),
    upload.single('product_image'),
    async (req, res) => {
        try {
            await productController.updateProductImage(req, res);
        } catch (error) {
            console.error('Route error - update product image:', error);
            res.status(500).json({ 
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// DELETE /api/products/:id - Delete product (farmer only)
router.delete('/:id',
    authenticateToken, authorizeRole('FARMER'),
    async (req, res) => {
        try {
            await productController.deleteProduct(req, res);
        } catch (error) {
            console.error('Route error - delete product:', error);
            res.status(500).json({ 
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

module.exports = router;