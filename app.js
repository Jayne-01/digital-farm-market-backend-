const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const productRoutes = require('./routes/productRoutes');
const adminRoutes = require('./routes/adminRoutes');
const farmerRoutes = require('./routes/farmerRoutes');
const orderRoutes = require('./routes/orderRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');

const app = express();

// Database connection
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'digital_market',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

// Test database connection
pool.connect()
    .then(() => console.log('✅ Connected to PostgreSQL database'))
    .catch(err => console.error('❌ Database connection error:', err));

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use('/uploads', express.static('uploads'));

// Request logging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// Health check
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({ 
            status: 'OK',
            database: 'Connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR',
            database: 'Disconnected',
            error: error.message 
        });
    }
});

// ========== WORKING REGISTER ENDPOINT (FIXED) ==========
app.post('/api/auth/register', async (req, res) => {
    console.log('🔥 Register endpoint called');
    console.log('Request body:', req.body);
    
    try {
        // Extract only the fields we need
        const { 
            full_name, 
            email, 
            password, 
            confirm_password,  // We'll validate this but not store it
            contact_number, 
            address,
            barangay 
        } = req.body;
        
        // Validation
        if (!full_name || !email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields',
                required: ['full_name', 'email', 'password']
            });
        }
        
        // Validate password confirmation
        if (password !== confirm_password) {
            return res.status(400).json({ 
                success: false,
                error: 'Passwords do not match'
            });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid email format'
            });
        }
        
        // Validate password strength
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false,
                error: 'Password must be at least 6 characters long'
            });
        }
        
        // Default role to CUSTOMER (always)
        const role = 'CUSTOMER';
        
        // Check if user already exists
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Email already registered',
                suggestion: 'Use a different email or try logging in'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert user into database 
        const result = await pool.query(
            `INSERT INTO users (
                full_name, 
                email, 
                password, 
                role, 
                contact_number, 
                address,
                barangay,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            RETURNING user_id, full_name, email, role, contact_number, address, barangay, created_at`,
            [
                full_name, 
                email, 
                hashedPassword, 
                role, 
                contact_number || null, 
                address || null,
                barangay || null
            ]
        );
        
        const user = result.rows[0];
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                user_id: user.user_id, 
                email: user.email, 
                role: user.role 
            },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            { expiresIn: '7d' }
        );
        
        console.log('✅ User registered successfully:', user.email);
        
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                user_id: user.user_id,
                full_name: user.full_name,
                email: user.email,
                role: user.role,
                contact_number: user.contact_number,
                address: user.address,
                barangay: user.barangay,
                created_at: user.created_at
            }
        });
        
    } catch (error) {
        console.error('❌ Registration error:', error);
        
        // Provide helpful error messages
        let errorMessage = 'Registration failed';
        let statusCode = 500;
        
        if (error.code === '23505') { // Unique violation
            errorMessage = 'Email already exists';
            statusCode = 400;
        } else if (error.code === '23502') { // Not null violation
            errorMessage = 'Missing required fields';
            statusCode = 400;
        } else if (error.code === '42703') { // Undefined column
            errorMessage = 'Invalid field in request';
            statusCode = 400;
        }
        
        res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========== WORKING LOGIN ENDPOINT ==========
app.post('/api/auth/login', async (req, res) => {
    console.log('🔥 Login endpoint called');
    
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Email and password are required' 
            });
        }
        
        // Find user
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid email or password' 
            });
        }
        
        const user = result.rows[0];
        
        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid email or password' 
            });
        }
        
        // Check if user is active
        if (user.status !== 'ACTIVE') {
            return res.status(403).json({ 
                success: false,
                error: 'Account is deactivated. Please contact support.' 
            });
        }
        
        // Generate token
        const token = jwt.sign(
            { 
                user_id: user.user_id, 
                email: user.email, 
                role: user.role 
            },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            { expiresIn: '7d' }
        );
        
        // Remove password from response
        delete user.password;
        
        console.log('✅ User logged in:', user.email);
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Login failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


// Get user profile (protected)
app.get('/api/auth/profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                error: 'No token provided' 
            });
        }
        
        // Verify token
        const decoded = jwt.verify(
            token, 
            process.env.JWT_SECRET || 'your-secret-key-change-in-production'
        );
        
        // Get user from database
        const result = await pool.query(
            'SELECT user_id, full_name, email, role, contact_number, address, barangay, created_at FROM users WHERE user_id = $1',
            [decoded.user_id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            user: result.rows[0]
        });
        
    } catch (error) {
        console.error('Profile error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid token' 
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to get profile'
        });
    }
});

// ========== UPDATE USER PROFILE ==========
app.put('/api/auth/update-profile', async (req, res) => {
    console.log('🔥 Update profile endpoint called');
    console.log('Request body:', req.body);
    
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                error: 'No token provided' 
            });
        }
        
        // Verify token
        const decoded = jwt.verify(
            token, 
            process.env.JWT_SECRET || 'your-secret-key-change-in-production'
        );
        
        // Extract updatable fields
        const { 
            full_name, 
            contact_number, 
            address,
            barangay 
        } = req.body;
        
        // Validate that at least one field is provided
        if (!full_name && !contact_number && !address && !barangay) {
            return res.status(400).json({ 
                success: false,
                error: 'At least one field must be provided for update'
            });
        }
        
        // Build dynamic update query
        let updateFields = [];
        let values = [];
        let paramCount = 1;
        
        if (full_name) {
            updateFields.push(`full_name = $${paramCount}`);
            values.push(full_name);
            paramCount++;
        }
        
        if (contact_number !== undefined) {
            updateFields.push(`contact_number = $${paramCount}`);
            values.push(contact_number || null); // Allow null to clear contact number
            paramCount++;
        }
        
        if (address !== undefined) {
            updateFields.push(`address = $${paramCount}`);
            values.push(address || null); // Allow null to clear address
            paramCount++;
        }
        
        if (barangay !== undefined) {
            updateFields.push(`barangay = $${paramCount}`);
            values.push(barangay || null); // Allow null to clear barangay
            paramCount++;
        }
        
        // Add updated_at timestamp
        updateFields.push(`updated_at = NOW()`);
        
        // Add user_id as last parameter
        values.push(decoded.user_id);
        
        // Execute update
        const result = await pool.query(
            `UPDATE users 
             SET ${updateFields.join(', ')}
             WHERE user_id = $${paramCount}
             RETURNING user_id, full_name, email, role, contact_number, address, barangay, created_at, updated_at`,
            values
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'User not found' 
            });
        }
        
        const updatedUser = result.rows[0];
        
        console.log('✅ Profile updated for user:', updatedUser.email);
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: updatedUser
        });
        
    } catch (error) {
        console.error('❌ Update profile error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid token' 
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to update profile',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========== REGISTER AS FARMER ==========
app.post('/api/auth/register-farmer', async (req, res) => {
    console.log('Register as farmer endpoint called');
    
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ 
                success: false,
                error: 'No token provided' 
            });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
        const { farm_name, farm_location, farm_description } = req.body;
        
        if (!farm_name) {
            return res.status(400).json({ 
                success: false,
                error: 'Farm name is required' 
            });
        }
        
        const existingFarmer = await pool.query(
            'SELECT * FROM farmers WHERE user_id = $1',
            [decoded.user_id]
        );
        
        if (existingFarmer.rows.length > 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Already has farmer profile',
                farmer_id: existingFarmer.rows[0].farmer_id
            });
        }
        
        // ✅ CLEAN SQL - NO COMMENTS
        const result = await pool.query(
            `INSERT INTO farmers (user_id, farm_name, barangay, product_categories, created_at) 
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING farmer_id, farm_name, barangay, product_categories, verified_status, created_at`,
            [decoded.user_id, farm_name, farm_location || null, farm_description || null]
        );
        
        await pool.query(
            'UPDATE users SET role = $1 WHERE user_id = $2',
            ['FARMER', decoded.user_id]
        );
        
        res.status(201).json({
            success: true,
            message: 'Farmer registration submitted',
            farmer: result.rows[0],
            note: 'Pending verification'
        });
        
    } catch (error) {
        console.error('Farmer registration error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid token' 
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to register as farmer'
        });
    }
});

// ========== DIRECT ADMIN CREATION (For initial setup only) ==========
app.post('/api/auth/create-first-admin', async (req, res) => {
    console.log('🔥 Create first admin endpoint called');
    
    try {
        // Check if any admin already exists
        const adminCheck = await pool.query(
            'SELECT * FROM users WHERE role = $1',
            ['ADMIN']
        );
        
        if (adminCheck.rows.length > 0) {
            return res.status(403).json({ 
                success: false,
                error: 'Admin already exists. Use admin registration endpoint instead.'
            });
        }
        
        // Extract admin data
        const { 
            full_name, 
            email, 
            password, 
            confirm_password,
            contact_number
        } = req.body;
        
        // Validation
        if (!full_name || !email || !password || !confirm_password) {
            return res.status(400).json({ 
                success: false,
                error: 'All fields are required',
                required: ['full_name', 'email', 'password', 'confirm_password']
            });
        }
        
        if (password !== confirm_password) {
            return res.status(400).json({ 
                success: false,
                error: 'Passwords do not match'
            });
        }
        
        if (password.length < 8) {
            return res.status(400).json({ 
                success: false,
                error: 'Password must be at least 8 characters'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create first admin
        const result = await pool.query(
            `INSERT INTO users (
                full_name, 
                email, 
                password, 
                role, 
                contact_number,
                status,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING user_id, full_name, email, role, contact_number, status, created_at`,
            [
                full_name, 
                email, 
                hashedPassword, 
                'ADMIN',
                contact_number || null,
                'ACTIVE'
            ]
        );
        
        const adminUser = result.rows[0];
        
        // Generate token
        const token = jwt.sign(
            { 
                user_id: adminUser.user_id, 
                email: adminUser.email, 
                role: adminUser.role 
            },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            { expiresIn: '7d' }
        );
        
        console.log('✅ First admin created successfully:', adminUser.email);
        
        res.status(201).json({
            success: true,
            message: 'First admin created successfully',
            token,
            admin: adminUser,
            warning: 'Save this token securely. Use it to register additional admins.'
        });
        
    } catch (error) {
        console.error('❌ First admin creation error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create first admin',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========== ADMIN REGISTRATION (Protected - only by existing admin) ==========
app.post('/api/auth/admin/register', async (req, res) => {
    console.log('🔥 Admin registration endpoint called');
    console.log('Request body:', req.body);
    
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                error: 'Admin token required' 
            });
        }
        
        // Verify token
        const decoded = jwt.verify(
            token, 
            process.env.JWT_SECRET || 'your-secret-key-change-in-production'
        );
        
        // Check if requester is admin
        const adminCheck = await pool.query(
            'SELECT * FROM users WHERE user_id = $1 AND role = $2',
            [decoded.user_id, 'ADMIN']
        );
        
        if (adminCheck.rows.length === 0) {
            return res.status(403).json({ 
                success: false,
                error: 'Only administrators can register new admins' 
            });
        }
        
        // Extract admin registration data
        const { 
            full_name, 
            email, 
            password, 
            confirm_password,
            contact_number, 
            address,
            barangay,
            admin_code // Optional security code
        } = req.body;
        
        // Validation
        if (!full_name || !email || !password || !confirm_password) {
            return res.status(400).json({ 
                success: false,
                error: 'Full name, email, password and confirmation are required',
                required: ['full_name', 'email', 'password', 'confirm_password']
            });
        }
        
        // Validate password confirmation
        if (password !== confirm_password) {
            return res.status(400).json({ 
                success: false,
                error: 'Passwords do not match'
            });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid email format'
            });
        }
        
        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({ 
                success: false,
                error: 'Admin password must be at least 8 characters long'
            });
        }
        
        // Optional: Check admin code (if using registration codes)
        if (process.env.ADMIN_REGISTRATION_CODE) {
            if (!admin_code || admin_code !== process.env.ADMIN_REGISTRATION_CODE) {
                return res.status(400).json({ 
                    success: false,
                    error: 'Invalid admin registration code'
                });
            }
        }
        
        // Check if user already exists
        const userCheck = await pool.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ 
                success: false,
                error: 'Email already registered',
                suggestion: 'Use a different email'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert admin into database
        const result = await pool.query(
            `INSERT INTO users (
                full_name, 
                email, 
                password, 
                role, 
                contact_number, 
                address,
                barangay,
                status,
                created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING user_id, full_name, email, role, contact_number, address, barangay, status, created_at`,
            [
                full_name, 
                email, 
                hashedPassword, 
                'ADMIN', // Always ADMIN role
                contact_number || null, 
                address || null,
                barangay || null,
                'ACTIVE' // Admins are active immediately
            ]
        );
        
        const adminUser = result.rows[0];
        
        // Generate JWT token for the new admin (optional)
        const adminToken = jwt.sign(
            { 
                user_id: adminUser.user_id, 
                email: adminUser.email, 
                role: adminUser.role 
            },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            { expiresIn: '7d' }
        );
        
        console.log('✅ Admin registered successfully by:', decoded.email);
        console.log('✅ New admin:', adminUser.email);
        
        res.status(201).json({
            success: true,
            message: 'Admin registered successfully',
            token: adminToken, // Return token for immediate login
            admin: {
                user_id: adminUser.user_id,
                full_name: adminUser.full_name,
                email: adminUser.email,
                role: adminUser.role,
                contact_number: adminUser.contact_number,
                address: adminUser.address,
                barangay: adminUser.barangay,
                status: adminUser.status,
                created_at: adminUser.created_at
            }
        });
        
    } catch (error) {
        console.error('❌ Admin registration error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid admin token' 
            });
        }
        
        let errorMessage = 'Admin registration failed';
        let statusCode = 500;
        
        if (error.code === '23505') { // Unique violation
            errorMessage = 'Email already exists';
            statusCode = 400;
        }
        
        res.status(statusCode).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========== ADMIN LOGIN ==========
app.post('/api/auth/admin/login', async (req, res) => {
    console.log('🔥 Admin login endpoint called');
    
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false,
                error: 'Email and password are required' 
            });
        }
        
        // Find user with ADMIN role
        const result = await pool.query(
            'SELECT * FROM users WHERE email = $1 AND role = $2',
            [email, 'ADMIN']
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid admin credentials' 
            });
        }
        
        const admin = result.rows[0];
        
        // Check password
        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid admin credentials' 
            });
        }
        
        // Check if admin is active
        if (admin.status !== 'ACTIVE') {
            return res.status(403).json({ 
                success: false,
                error: 'Admin account is deactivated' 
            });
        }
        
        // Generate token
        const token = jwt.sign(
            { 
                user_id: admin.user_id, 
                email: admin.email, 
                role: admin.role 
            },
            process.env.JWT_SECRET || 'your-secret-key-change-in-production',
            { expiresIn: '7d' }
        );
        
        // Remove password from response
        delete admin.password;
        
        console.log('✅ Admin logged in:', admin.email);
        
        res.json({
            success: true,
            message: 'Admin login successful',
            token,
            admin: admin
        });
        
    } catch (error) {
        console.error('❌ Admin login error:', error);
        res.status(500).json({
            success: false,
            error: 'Admin login failed',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// ========== GET ALL USERS (Admin only) ==========
app.get('/api/auth/admin/users', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false,
                error: 'Admin token required' 
            });
        }
        
        // Verify token
        const decoded = jwt.verify(
            token, 
            process.env.JWT_SECRET || 'your-secret-key-change-in-production'
        );
        
        // Check if requester is admin
        const adminCheck = await pool.query(
            'SELECT * FROM users WHERE user_id = $1 AND role = $2',
            [decoded.user_id, 'ADMIN']
        );
        
        if (adminCheck.rows.length === 0) {
            return res.status(403).json({ 
                success: false,
                error: 'Admin access required' 
            });
        }
        
        // Get all users (except passwords)
        const usersResult = await pool.query(
            `SELECT user_id, full_name, email, role, contact_number, address, barangay, status, created_at 
             FROM users 
             ORDER BY created_at DESC`
        );
        
        res.json({
            success: true,
            count: usersResult.rows.length,
            users: usersResult.rows
        });
        
    } catch (error) {
        console.error('Get users error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false,
                error: 'Invalid token' 
            });
        }
        
        res.status(500).json({
            success: false,
            error: 'Failed to get users'
        });
    }
});

// ========== PRODUCT ROUTES ==========
app.use('/api/products', productRoutes);

// ========== ADMIN ROUTES ==========
app.use('/api/admin', adminRoutes);

// ========== FARMER ROUTES ==========  
app.use('/api/farmers', farmerRoutes);

// ========== ORDER ROUTES ==========
app.use('/api/orders', orderRoutes);

// ========== RECOMMENDATION ROUTES ==========
app.use('/api/recommendations', recommendationRoutes);

// ========== ERROR HANDLING ==========
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use('*', (req, res) => {
    console.log(`❌ 404: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: [
            //customer registration/login
            'POST /api/auth/register',
            'POST /api/auth/login',
            'GET /api/auth/profile (requires token)',
            'PUT /api/auth/update-profile (requires token)',
            //farmer registration
            'POST /api/auth/register-farmer (requires token)',

            //admin registration/login
            'POST /api/auth/create-first-admin (Initial setup only)',
            'POST /api/auth/admin/register (Admin only)',
            'POST /api/auth/admin/login (Admin login)',
            'GET /api/auth/admin/users (Admin only)',

            // Admin endpoints
            'GET  /api/admin/users',
            'GET  /api/admin/users/:id',
            'PATCH /api/admin/users/:id/status',
            'PATCH /api/admin/users/:id/role',
            'GET  /api/admin/farmers/pending-verifications',
            'PATCH /api/admin/farmers/:id/verify',
            'GET  /api/admin/products',
            'PATCH /api/admin/products/:id/status',
            'GET  /api/admin/orders',
            'PATCH /api/admin/orders/:id',
            'GET  /api/admin/analytics',
            'GET  /api/admin/settings/logs',
            'PUT  /api/admin/settings',
            
            //farmer endpoints
            'GET  /api/farmers/dashboard (Farmer only)',
            'PUT  /api/farmers/profile (Farmer only)',
            'GET  /api/farmers/sales-report (Farmer only)',
            'GET  /api/farmers/inventory (Farmer only)',
            'GET  /api/farmers/reviews (Farmer only)',
            'GET  /api/farmers/performance (Farmer only)',

            // Products endpoints
            'GET    /api/products (Get all products - public)',
            'GET    /api/products/search (Search products - public)',
            'GET    /api/products/category/:category (Get products by category - public)',
            'GET    /api/products/:id (Get product by ID - public)',
            'POST   /api/products (Create product with image - farmer only)',
            'GET    /api/products/farmer/products (Get farmer products - farmer only)',
            'PUT    /api/products/:id (Update product with image - farmer only)',
            'PATCH  /api/products/:id/status (Update product status - farmer only)',
            'PATCH  /api/products/:id/image (Update product image only - farmer only)',
            'DELETE /api/products/:id (Delete product - farmer only)',

            //order endpoints
            'POST /api/orders (Create order - requires token)',
            'GET  /api/orders/customer (Customer orders - requires token)',
            'GET  /api/orders/farmer (Farmer orders - requires token)',
            'GET  /api/orders/:id (Get order by ID - requires token)',
            'PUT  /api/orders/:id/status (Update status - requires token)',
            'GET  /api/orders/:id/items (Get order items - requires token)',

            //recommendation endpoints:
            'GET /api/recommendations/market-insights (Farmer only)',
            'GET /api/recommendations/customer-preferences',
            'GET /api/recommendations/seasonal',
            'GET /api/recommendations/personalized (Customer only)',
            'GET /api/recommendations/demand-analysis (Farmer only)',

            //health check
            'GET /health',
        ]
    });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 DIGITAL MARKET BACKEND SERVER');
    console.log('='.repeat(60));
    console.log(`✅ Server running on: http://localhost:${PORT}`);
    console.log(`📋 Available endpoints:`);
    
    console.log(`\n   🔐 ADMIN REGISTRATION (Requires admin token):`);
    console.log(`   • POST /api/auth/create-first-admin (Create first admin - Initial setup)`);
    console.log(`   • POST /api/auth/admin/register (Register new admin - Admin only)`);
    console.log(`   • POST /api/auth/admin/login   (Admin login)`);
    console.log(`   • GET  /api/auth/admin/users   (Get all users - Admin only)`);

    console.log(`\n   🔐 ADMIN ENDPOINTS (Requires admin token):`);
    console.log(`   • GET  /api/admin/users`);
    console.log(`   • GET  /api/admin/users/:id`);
    console.log(`   • PATCH /api/admin/users/:id/status`);
    console.log(`   • PATCH /api/admin/users/:id/role`);
    console.log(`   • GET  /api/admin/farmers/pending-verifications`);
    console.log(`   • PATCH /api/admin/farmers/:id/verify`);
    console.log(`   • GET  /api/admin/products`);
    console.log(`   • PATCH /api/admin/products/:id/status`);
    console.log(`   • GET  /api/admin/orders`);
    console.log(`   • PATCH /api/admin/orders/:id`);
    console.log(`   • GET  /api/admin/analytics`);
    console.log(`   • GET  /api/admin/settings/logs`);
    console.log(`   • PUT  /api/admin/settings`);

    console.log(`\n   🔐 CUSTOMER REGISTRATION/LOGIN`);
    console.log(`   • POST /api/auth/register  (Register new user)`);
    console.log(`   • POST /api/auth/login     (Login user)`);
    console.log(`   • GET  /api/auth/profile   (Get profile - requires token)`);
    console.log(`   • GET  /api/auth/update-profile   (PUT update-profile - requires token)`);
    console.log(`   • GET  /api/products       (Get all products)`);
    console.log(`   • GET  /api/products/:id   (Get product by ID)`);

    console.log(`\n   🔐 FARMER REGISTRATION (Requires USER token):`);
    console.log(`   • POST /api/auth/register-farmer (Become a farmer - requires token)`);

    console.log(`\n   🔐 FARMER ENDPOINTS (Requires FARMER token):`);
    console.log(`   • GET  /api/farmers/dashboard (Dashboard overview)`);
    console.log(`   • PUT  /api/farmers/profile (Update farmer profile)`);
    console.log(`   • GET  /api/farmers/sales-report (Sales analytics)`);
    console.log(`   • GET  /api/farmers/inventory (Product inventory)`);
    console.log(`   • GET  /api/farmers/reviews (Customer feedback)`);
    console.log(`   • GET  /api/farmers/performance (Performance metrics)`);

    console.log(`\n   🌾 PRODUCTS ENDPOINTS`);
    console.log(`   • GET    /api/products  (Get all products - public)`);
    console.log(`   • GET    /api/products/search  (Search products - public)`);
    console.log(`   • GET    /api/products/category/:category  (Products by category - public)`);
    console.log(`   • GET    /api/products/:id  (Get product by ID - public)`);
    console.log(`   • POST   /api/products  (Create product with image - farmer only)`);
    console.log(`   • GET    /api/products/farmer/products (Get farmer products - farmer only)`);
    console.log(`   • PUT    /api/products/:id  (Update product with image - farmer only)`);
    console.log(`   • PATCH  /api/products/:id/status  (Update product status - farmer only)`);
    console.log(`   • PATCH  /api/products/:id/image  (Update product image only - farmer only)`);
    console.log(`   • DELETE /api/products/:id  (Delete product - farmer only)`);

    console.log(`\n   🛒 ORDER ENDPOINTS (Requires token):`);
    console.log(`   • POST /api/orders   (Create new order)`);
    console.log(`   • GET  /api/orders/customer (Get customer orders)`);
    console.log(`   • GET  /api/orders/farmer (Get farmer orders)`);
    console.log(`   • GET  /api/orders/:id  (Get specific order)`);
    console.log(`   • PUT  /api/orders/:id/status (Update order status)`);
    console.log(`   • GET  /api/orders/:id/items  (Get order items)`);


    console.log(`\n   🔐 RECOMMENDATION ENDPOINTS (Requires token):`);
    console.log(`   • GET /api/recommendations/market-insights     (Market insights - Farmer only)`);
    console.log(`   • GET /api/recommendations/customer-preferences (Trending products)`);
    console.log(`   • GET /api/recommendations/seasonal            (Seasonal recommendations)`);
    console.log(`   • GET /api/recommendations/personalized        (Personalized - Customer only)`);
    console.log(`   • GET /api/recommendations/demand-analysis     (Demand analysis - Farmer only)`);

    console.log(`\n   • GET  /health   (Health check)`);
    console.log('='.repeat(60) + '\n');
});