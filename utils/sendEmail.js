const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

console.log('Email service initialized with environment variables:', {
  EMAIL_USER: process.env.EMAIL_USER ? 'set' : 'not set',
  EMAIL_PASS: process.env.EMAIL_PASS ? 'set' : 'not set',
});
const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    //host: 'smtp.gmail.com',
    host: "smtp.ionos.co.uk",
    port: 587, // 465 is SSL (strict); 587 works with STARTTLS
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      // Only disable in development if absolutely necessary
      rejectUnauthorized: process.env.NODE_ENV !== 'production',
      // Specify minimum TLS version for security
      minVersion: 'TLSv1.2'
    }
  });

  const mailOptions = {
    from: '"NutBasket" <info@nut-basket.co.uk>',
    to: options.email,
    subject: options.subject,
    html: options.message,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;