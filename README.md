# InkSoul Backend API

Backend API for the InkSoul e-commerce platform - a custom t-shirt design and ordering system.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB (local or MongoDB Atlas)
- npm or yarn

### Local Development

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start MongoDB** (if running locally)
   ```bash
   # macOS/Linux
   mongod
   
   # Windows
   # Start MongoDB service from Services
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:5000`

## 📁 Project Structure

```
backend/
├── middleware/       # Custom middleware (auth, validation, etc.)
├── models/          # Mongoose models
├── routes/          # API route handlers
│   ├── auth.js      # Authentication routes
│   ├── products.js  # Product management
│   ├── orders.js    # Order processing
│   ├── users.js     # User management
│   ├── admin.js     # Admin operations
│   ├── payments.js  # Stripe payment integration
│   ├── designs.js   # Custom design uploads
│   ├── coupons.js   # Discount coupons
│   └── notifications.js
├── uploads/         # User uploaded files
├── .env.example     # Environment variables template
├── server.js        # Application entry point
├── package.json     # Dependencies and scripts
├── Dockerfile       # Docker configuration
└── render.yaml      # Render.com deployment config
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - List all products
- `GET /api/products/:id` - Get product details
- `POST /api/products` - Create product (admin)
- `PUT /api/products/:id` - Update product (admin)
- `DELETE /api/products/:id` - Delete product (admin)

### Orders
- `GET /api/orders` - Get user orders
- `GET /api/orders/:id` - Get order details
- `POST /api/orders` - Create new order
- `PUT /api/orders/:id` - Update order status (admin)

### Payments
- `POST /api/payments/create-checkout-session` - Create Stripe checkout
- `POST /api/payments/webhook` - Stripe webhook handler

### Health Check
- `GET /api/health` - Service health status

## 🔐 Environment Variables

See `.env.example` for all required environment variables. Key variables:

- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - Secret for JWT token generation
- `STRIPE_SECRET_KEY` - Stripe API secret key
- `CLIENT_URL` - Frontend URL (for CORS)

## 🌐 Deployment

### Deploy to Render.com

**📖 See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions**

Quick steps:
1. Push code to GitHub
2. Create new Web Service on Render.com
3. Connect your repository
4. Set environment variables
5. Deploy!

Your API will be live at `https://your-service-name.onrender.com`

### Deploy with Docker

```bash
# Build image
docker build -t inksoul-backend .

# Run container
docker run -p 5000:5000 --env-file .env inksoul-backend
```

## 🛠️ Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests (not implemented yet)

## 🔒 Security Features

- **Helmet.js** - Security headers
- **Rate Limiting** - Prevent abuse (100 requests per 15 minutes)
- **CORS** - Configured for frontend origin
- **JWT Authentication** - Secure user sessions
- **Input Validation** - Express-validator for request validation
- **Password Hashing** - bcryptjs for secure password storage

## 🧪 Testing

```bash
# Test health endpoint
curl http://localhost:5000/api/health

# Test with authentication
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:5000/api/users/profile
```

## 📝 Development Notes

### Database Schema
- **Users** - User accounts and authentication
- **Products** - T-shirt products and variants
- **Orders** - Customer orders and order items
- **Designs** - Custom user-uploaded designs
- **Coupons** - Discount codes

### File Uploads
- Handled by Multer middleware
- Stored in `./uploads` directory
- **Note**: For production on Render.com, use cloud storage (S3, Cloudinary) as local storage is ephemeral

### Payment Processing
- Integrated with Stripe
- Supports checkout sessions
- Webhook handling for payment events

## 🐛 Troubleshooting

### MongoDB Connection Issues
```bash
# Check if MongoDB is running
mongosh

# If using MongoDB Atlas, verify:
# - Connection string is correct
# - IP whitelist includes your IP (or 0.0.0.0/0)
# - Database user credentials are correct
```

### Port Already in Use
```bash
# Find process using port 5000
# Windows
netstat -ano | findstr :5000

# macOS/Linux
lsof -i :5000

# Kill the process or change PORT in .env
```

## 📚 Technologies Used

- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **Stripe** - Payment processing
- **Multer** - File uploads
- **Helmet** - Security
- **CORS** - Cross-origin resource sharing

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

For deployment help, see [DEPLOYMENT.md](./DEPLOYMENT.md)

---

**Built with ❤️ by the InkSoul Team**
