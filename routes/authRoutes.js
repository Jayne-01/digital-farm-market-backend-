const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const {full_name, email, password, confirm_password, contact_number, barangay, address } = req.body;
        
        // Validation
        if (!full_name || !email || !password || !confirm_password || !contact_number || !barangay || !address) {
            return res.status(400).json({ 
                message: 'All fields are required' 
            });
        }
        
        if (password !== confirmPassword) {
            return res.status(400).json({ 
                message: 'Passwords do not match' 
            });
        }
        
        if (!terms) {
            return res.status(400).json({ 
                message: 'You must agree to the Terms of Service' 
            });
        }
        
        // Check if user already exists (simplified example)
         const existingUser = await User.findOne({ email });
         if (existingUser) {
             return res.status(400).json({ message: 'Email already registered' });
         }
        
        // Create user (simplified example)
         const newUser = await User.create({
             email,
             password: await bcrypt.hash(password, 10),
             contact_number,
             barangay,
             address,
             role: 'customer' // or 'farmer'
         });
        
        // For now, return success
        res.status(201).json({
            message: 'Registration successful!',
            user: {
                email,
                contact_number,
                barangay,
                address,
                // Don't send password back
            }
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validation
        if (!email || !password) {
            return res.status(400).json({ 
                message: 'Email and password are required' 
            });
        }
        
        // Check if user exists (you'll need to uncomment this when you have User model)
         const user = await User.findOne({ email });
         if (!user) {
             return res.status(401).json({ 
                 message: 'Invalid email or password' 
             });
         }
       // Check if valid email or password
        const isValidPassword = password.length >= 5; // Basic validation
        
        if (!isValidPassword) {
            return res.status(401).json({ 
                message: 'Invalid email or password' 
            });
        }
        
        // For now, return success (temporary implementation)
        // IMPORTANT: Replace this with actual user data from database
        res.status(200).json({
            message: 'Login successful!',
            user: {
                email,
                
            },
            // Add token when implementing JWT
            // token: generateToken(user.id)
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;