const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

const authorizeRole = (...roles) => {
    return (req, res, next) => {
        console.log('=== AUTHORIZE ROLE CALLED ===');
        console.log('Roles passed:', roles);  // Should show ['FARMER']
        console.log('User role from JWT:', req.user?.role || req.user?.userRole);
        
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        const userRole = req.user.role || req.user.userRole;
        
        if (!roles.includes(userRole)) {
            console.log('ROLE MISMATCH!');
            console.log('User has:', userRole);
            console.log('Required:', roles);
            return res.status(403).json({ 
                error: `Access denied. Required roles: ${roles.join(', ')}`,
                yourRole: userRole,
                requiredRoles: roles
            });
        }
        
        console.log('Role check PASSED!');
        next();
    };
};

module.exports = {
    authenticateToken,
    authorizeRole
};