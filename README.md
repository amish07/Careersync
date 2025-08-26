# CareerSync Pro - AI-Powered Job Portal

A modern job portal application with AI-powered features including resume analysis, cover letter generation, and intelligent job matching using Llama 3.2.

## Features

- **AI-Powered Job Matching**: Intelligent job recommendations based on user skills and preferences
- **Resume Analysis**: AI-driven resume analysis against job requirements
- **Cover Letter Generation**: Automated, personalized cover letter creation
- **Real-time Chat Assistant**: AI career counselor powered by Llama 3.2
- **Application Tracking**: Complete application lifecycle management
- **Smart Filtering**: AI-enhanced job search filters
- **Responsive Design**: Modern, glassmorphism UI with animations

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL (Supabase)
- **AI Integration**: OpenRouter API with Llama 3.2-3B-Instruct
- **Deployment**: Railway
- **Authentication**: JWT tokens
- **Security**: Helmet, CORS, Rate limiting

## Quick Start

### Prerequisites

- Node.js 16+ and npm
- PostgreSQL database (Supabase recommended)
- OpenRouter API key

### Local Development

1. **Clone and install dependencies:**
```bash
git clone <your-repo-url>
cd careersync-pro
npm install
```

2. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env with your actual values
```

3. **Set up the database:**
```bash
# Connect to your Supabase/PostgreSQL database
psql "your-database-connection-string"
# Run the schema
\i schema.sql
```

4. **Start development server:**
```bash
npm run dev
```

Visit `http://localhost:3000` to see the application.

## Railway Deployment

### Step 1: Prepare Your Repository

1. Create a new GitHub repository
2. Push all code to the repository:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/yourusername/careersync-pro.git
git push -u origin main
```

### Step 2: Deploy to Railway

1. Visit [Railway.app](https://railway.app) and sign up/login
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will automatically detect it's a Node.js app

### Step 3: Configure Environment Variables

In Railway dashboard, go to your project → Variables tab and add:

```
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-here
OPENROUTER_API_KEY=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
PORT=3000
```

### Step 4: Set Up Supabase Database

1. Go to [Supabase.com](https://supabase.com) and create a new project
2. In SQL Editor, paste and run the contents of `schema.sql`
3. Go to Settings → Database → Connection string
4. Copy the connection string and add to Railway as `DATABASE_URL`

### Step 5: Update SITE_URL

Once Railway gives you your domain (e.g., `your-app-name.railway.app`), add:

```
SITE_URL=https://your-app-name.railway.app
```

## Database Schema

The application uses PostgreSQL with the following main tables:

- **users**: User profiles and authentication
- **jobs**: Job listings with AI-enhanced metadata
- **applications**: Application tracking with AI analysis
- **wishlist**: Saved jobs
- **ai_conversations**: Chat history with AI assistant
- **resume_analyses**: AI resume analysis results

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### Jobs
- `GET /api/jobs` - List jobs with filtering
- `GET /api/jobs/:id` - Get job details
- `POST /api/applications` - Apply to job
- `GET /api/applications` - User's applications

### AI Features
- `POST /api/ai/chat` - Chat with AI assistant
- `POST /api/ai/analyze-resume` - AI resume analysis
- `POST /api/ai/generate-cover-letter` - Generate cover letter
- `POST /api/ai/smart-filter` - AI-powered job filtering

### User Management
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update profile
- `GET /api/wishlist` - Get saved jobs
- `POST /api/wishlist` - Save job
- `DELETE /api/wishlist/:jobId` - Remove saved job

## AI Integration

The application integrates with Llama 3.2-3B-Instruct via OpenRouter for:

- **Resume Analysis**: Matches resumes against job requirements
- **Cover Letter Generation**: Creates personalized cover letters
- **Career Chat**: Real-time career advice and guidance
- **Smart Job Filtering**: AI-enhanced job recommendations

Rate limiting is implemented to prevent API abuse while maintaining good user experience.

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting on all endpoints
- Extra rate limiting on AI endpoints
- CORS configuration
- Helmet for security headers
- Input validation and sanitization

## Performance Optimizations

- Database indexing on frequently queried fields
- Connection pooling for PostgreSQL
- Caching of AI analysis results
- Pagination for large datasets
- Compressed responses

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Secret for JWT tokens | Yes |
| `OPENROUTER_API_KEY` | API key for Llama 3.2 access | Yes |
| `NODE_ENV` | Environment (production/development) | Yes |
| `PORT` | Server port (default: 3000) | No |
| `SITE_URL` | Your app's URL | Yes |

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify DATABASE_URL is correct
   - Check if database schema is properly initialized
   - Ensure Supabase project is not paused

2. **AI Features Not Working**
   - Verify OPENROUTER_API_KEY is valid
   - Check rate limits haven't been exceeded
   - Review API call logs in Railway

3. **Build/Deploy Failures**
   - Ensure all environment variables are set
   - Check Node.js version compatibility
   - Review Railway build logs

### Getting Help

- Check Railway deployment logs
- Review browser console for frontend errors
- Monitor Supabase dashboard for database issues
- Test API endpoints directly with curl or Postman

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

---

Built with ❤️ using AI and modern web technologies.
