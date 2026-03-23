// routes/authRoutes.js
const { protect } = require('../middlewares/authMiddleware');
const { getMe } = require('../controllers/authController');
const express = require('express');

const router = express.Router();
const {
  registerUser,
  loginUser,
  forgotPassword,
  resetPassword,
  verifyOtp
} = require('../controllers/authController');
const { validateSignup, handleValidationErrors } = require('../validators/authValidators');

router.post('/signup', validateSignup, handleValidationErrors, registerUser);
router.post('/login', loginUser);
router.get('/me', protect, getMe);

router.post('/verify-otp', verifyOtp);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);

module.exports = router;
