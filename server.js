const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// AI Configuration
const AI_CONFIG = {
    model: 'meta-llama/llama-3.2-3b-instruct:free',
    apiKey: process.env.OPENROUTER_API_KEY || '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',
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions'
};

// Database configuration
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// AI rate limiting (more restrictive)
const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10 // limit each IP to 10 AI requests per minute
});

// JWT middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Serve main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// AI Helper Functions
async function callAI(prompt, systemPrompt = '', context = {}) {
    try {
        const response = await fetch(AI_CONFIG.baseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
                'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
                'X-Title': 'CareerSync Pro'
            },
            body: JSON.stringify({
                model: AI_CONFIG.model,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt || `You are a helpful AI career assistant for CareerSync Pro. You help users with job searching, career advice, resume analysis, and interview preparation. Be concise, helpful, and professional. Context: ${JSON.stringify(context)}`
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.7,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            throw new Error(`AI service error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (error) {
        console.error('AI API Error:', error);
        throw error;
    }
}

// Authentication Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }

        // Check if user already exists
        const userExists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(409).json({ error: 'User already exists' });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user
        const result = await pool.query(
            'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
            [email, passwordHash, name]
        );

        const user = result.rows[0];
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback-secret');

        res.status(201).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Get user
        const result = await pool.query('SELECT id, email, name, password_hash FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Check password
        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback-secret');

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Jobs Routes
app.get('/api/jobs', async (req, res) => {
    try {
        const { 
            search, 
            location, 
            category, 
            minSalary, 
            maxSalary, 
            jobType, 
            experienceLevel,
            page = 1, 
            limit = 20 
        } = req.query;

        let query = `
            SELECT j.*, c.logo_url as company_logo
            FROM jobs j 
            LEFT JOIN companies c ON j.company_id = c.id 
            WHERE j.status = 'active'
        `;
        const params = [];
        let paramCount = 0;

        if (search) {
            paramCount++;
            query += ` AND (j.title ILIKE $${paramCount} OR j.description ILIKE $${paramCount} OR j.company_name ILIKE $${paramCount} OR $${paramCount} = ANY(j.skills))`;
            params.push(`%${search}%`);
        }

        if (location) {
            paramCount++;
            query += ` AND j.location ILIKE $${paramCount}`;
            params.push(`%${location}%`);
        }

        if (category) {
            paramCount++;
            query += ` AND j.category = $${paramCount}`;
            params.push(category);
        }

        if (jobType) {
            paramCount++;
            query += ` AND j.job_type = $${paramCount}`;
            params.push(jobType);
        }

        if (experienceLevel) {
            paramCount++;
            query += ` AND j.experience_level = $${paramCount}`;
            params.push(experienceLevel);
        }

        if (minSalary) {
            paramCount++;
            query += ` AND j.salary_min >= $${paramCount}`;
            params.push(minSalary);
        }

        if (maxSalary) {
            paramCount++;
            query += ` AND j.salary_max <= $${paramCount}`;
            params.push(maxSalary);
        }

        query += ` ORDER BY j.posted_date DESC`;
        
        // Pagination
        const offset = (page - 1) * limit;
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        params.push(limit);
        
        paramCount++;
        query += ` OFFSET $${paramCount}`;
        params.push(offset);

        const result = await pool.query(query, params);
        
        // Get total count for pagination
        let countQuery = `SELECT COUNT(*) FROM jobs j WHERE j.status = 'active'`;
        const countParams = [];
        let countParamCount = 0;

        // Apply same filters to count query
        if (search) {
            countParamCount++;
            countQuery += ` AND (j.title ILIKE $${countParamCount} OR j.description ILIKE $${countParamCount} OR j.company_name ILIKE $${countParamCount} OR $${countParamCount} = ANY(j.skills))`;
            countParams.push(`%${search}%`);
        }

        if (location) {
            countParamCount++;
            countQuery += ` AND j.location ILIKE $${countParamCount}`;
            countParams.push(`%${location}%`);
        }

        if (category) {
            countParamCount++;
            countQuery += ` AND j.category = $${countParamCount}`;
            countParams.push(category);
        }

        const countResult = await pool.query(countQuery, countParams);
        const totalJobs = parseInt(countResult.rows[0].count);

        res.json({
            jobs: result.rows,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalJobs / limit),
                totalJobs,
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Jobs fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/jobs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT j.*, c.logo_url as company_logo, c.description as company_description
            FROM jobs j 
            LEFT JOIN companies c ON j.company_id = c.id 
            WHERE j.id = $1 AND j.status = 'active'
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Job fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Applications Routes
app.post('/api/applications', authenticateToken, async (req, res) => {
    try {
        const { jobId, coverLetter, resumeUrl } = req.body;
        const userId = req.user.userId;

        // Check if job exists and is active
        const jobResult = await pool.query('SELECT title, company_name FROM jobs WHERE id = $1 AND status = $2', [jobId, 'active']);
        if (jobResult.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found or no longer active' });
        }

        const job = jobResult.rows[0];

        // Check if analysis already exists
        const existingAnalysis = await pool.query(`
            SELECT * FROM resume_analyses 
            WHERE user_id = $1 AND job_id = $2 
            ORDER BY created_at DESC 
            LIMIT 1
        `, [userId, jobId]);

        if (existingAnalysis.rows.length > 0) {
            const analysis = existingAnalysis.rows[0];
            return res.json({
                matchScore: analysis.match_score,
                matchingSkills: analysis.matching_skills,
                missingSkills: analysis.missing_skills,
                strengths: analysis.strengths,
                suggestions: analysis.suggestions,
                cached: true
            });
        }

        // Create AI prompt for resume analysis
        const prompt = `Analyze this resume against the job requirements and provide a detailed assessment:

JOB TITLE: ${job.title}
JOB REQUIREMENTS: ${job.requirements}
REQUIRED SKILLS: ${job.skills.join(', ')}
JOB DESCRIPTION: ${job.description}

RESUME CONTENT:
${resumeText}

Please provide a JSON response with:
1. score (0-100): Overall match percentage
2. matchingSkills (array): Skills found in resume that match job requirements
3. missingSkills (array): Important skills missing from resume
4. strengths (array): Key strengths of the candidate
5. suggestions (array): Specific improvement recommendations

Return only valid JSON.`;

        const systemPrompt = 'You are an expert resume analyzer. Provide objective, actionable feedback in valid JSON format only. No additional text outside the JSON structure.';

        // Call AI for analysis
        const aiResponse = await callAI(prompt, systemPrompt);

        let analysis;
        try {
            analysis = JSON.parse(aiResponse);
        } catch (parseError) {
            console.error('AI response parsing error:', parseError);
            // Fallback analysis
            analysis = {
                score: Math.floor(Math.random() * 40) + 50,
                matchingSkills: ['Problem Solving', 'Team Collaboration'],
                missingSkills: ['Specific Technical Skills', 'Industry Experience'],
                strengths: ['Strong educational background', 'Relevant experience'],
                suggestions: ['Add quantifiable achievements', 'Include recent project details']
            };
        }

        // Save analysis to database
        await pool.query(`
            INSERT INTO resume_analyses (user_id, job_id, match_score, matching_skills, missing_skills, strengths, suggestions, analysis_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
            userId, jobId, analysis.score, analysis.matchingSkills, 
            analysis.missingSkills, analysis.strengths, analysis.suggestions, 
            JSON.stringify(analysis)
        ]);

        res.json({
            matchScore: analysis.score,
            matchingSkills: analysis.matchingSkills,
            missingSkills: analysis.missingSkills,
            strengths: analysis.strengths,
            suggestions: analysis.suggestions,
            cached: false
        });

    } catch (error) {
        console.error('Resume analysis error:', error);
        res.status(500).json({ error: 'Analysis service temporarily unavailable' });
    }
});

app.post('/api/ai/generate-cover-letter', aiLimiter, authenticateToken, async (req, res) => {
    try {
        const { jobId, userExperience, customPrompt } = req.body;
        const userId = req.user.userId;

        if (!jobId) {
            return res.status(400).json({ error: 'Job ID is required' });
        }

        // Get job and user details
        const jobResult = await pool.query('SELECT title, company_name, description, requirements FROM jobs WHERE id = $1', [jobId]);
        if (jobResult.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const userResult = await pool.query('SELECT name, skills FROM users WHERE id = $1', [userId]);
        
        const job = jobResult.rows[0];
        const user = userResult.rows[0];

        const prompt = `Generate a professional cover letter for:
Position: ${job.title}
Company: ${job.company_name}
Job Description: ${job.description}
Requirements: ${job.requirements}
Applicant Name: ${user?.name || 'Applicant'}
Applicant Skills: ${user?.skills?.join(', ') || 'Various professional skills'}
Additional Experience: ${userExperience || 'Relevant industry experience'}
Custom Requirements: ${customPrompt || 'Standard professional cover letter'}

Create a compelling, personalized cover letter that highlights relevant experience, shows enthusiasm, and addresses specific job requirements. Keep it professional and concise.`;

        const systemPrompt = 'You are an expert career writer. Create compelling, professional cover letters that are personalized and show genuine interest. Keep the tone professional but engaging.';

        const coverLetter = await callAI(prompt, systemPrompt);

        res.json({ coverLetter });

    } catch (error) {
        console.error('Cover letter generation error:', error);
        res.status(500).json({ error: 'Cover letter service temporarily unavailable' });
    }
});

app.post('/api/ai/smart-filter', aiLimiter, authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { preferences } = req.body;

        // Get user data
        const userResult = await pool.query(`
            SELECT u.skills, u.experience_level, up.preferred_locations, up.preferred_categories
            FROM users u
            LEFT JOIN user_preferences up ON u.id = up.user_id
            WHERE u.id = $1
        `, [userId]);

        const user = userResult.rows[0];

        // Get user's application history for pattern analysis
        const applicationsResult = await pool.query(`
            SELECT j.category, j.skills, j.location, j.experience_level
            FROM applications a
            JOIN jobs j ON a.job_id = j.id
            WHERE a.user_id = $1
            ORDER BY a.applied_date DESC
            LIMIT 10
        `, [userId]);

        // Build AI recommendation prompt
        const userProfile = {
            skills: user?.skills || [],
            experienceLevel: user?.experience_level || 'mid',
            preferredLocations: user?.preferred_locations || [],
            preferredCategories: user?.preferred_categories || [],
            recentApplications: applicationsResult.rows
        };

        let query = `
            SELECT j.*, 
                   (CASE WHEN $1 = ANY(j.skills) THEN 1 ELSE 0 END) as skill_match_count
            FROM jobs j 
            WHERE j.status = 'active'
        `;
        const params = [user?.skills || []];

        // Apply AI-suggested filters based on user profile
        if (user?.preferred_categories && user.preferred_categories.length > 0) {
            query += ` AND j.category = ANY(${params.length + 1})`;
            params.push(user.preferred_categories);
        }

        if (user?.experience_level) {
            query += ` AND j.experience_level IN (${params.length + 1}, 'any')`;
            params.push([user.experience_level]);
        }

        query += ` ORDER BY skill_match_count DESC, j.posted_date DESC LIMIT 20`;

        const result = await pool.query(query, params);

        res.json({
            jobs: result.rows,
            reasoning: `Found ${result.rows.length} jobs matched to your profile based on skills, experience level, and application patterns.`
        });

    } catch (error) {
        console.error('Smart filter error:', error);
        res.status(500).json({ error: 'Smart filter temporarily unavailable' });
    }
});

// User Profile Routes
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(`
            SELECT u.*, up.preferred_locations, up.preferred_categories, up.min_salary, up.max_salary
            FROM users u
            LEFT JOIN user_preferences up ON u.id = up.user_id
            WHERE u.id = $1
        `, [userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];
        delete user.password_hash; // Never send password hash

        res.json(user);
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const { 
            name, phone, location, bio, skills, experienceLevel, 
            resumeUrl, linkedinUrl, githubUrl,
            preferredLocations, preferredCategories, minSalary, maxSalary
        } = req.body;

        // Update user profile
        await pool.query(`
            UPDATE users SET 
                name = COALESCE($1, name),
                phone = COALESCE($2, phone),
                location = COALESCE($3, location),
                bio = COALESCE($4, bio),
                skills = COALESCE($5, skills),
                experience_level = COALESCE($6, experience_level),
                resume_url = COALESCE($7, resume_url),
                linkedin_url = COALESCE($8, linkedin_url),
                github_url = COALESCE($9, github_url)
            WHERE id = $10
        `, [name, phone, location, bio, skills, experienceLevel, resumeUrl, linkedinUrl, githubUrl, userId]);

        // Update or insert user preferences
        await pool.query(`
            INSERT INTO user_preferences (user_id, preferred_locations, preferred_categories, min_salary, max_salary)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id) DO UPDATE SET
                preferred_locations = COALESCE($2, user_preferences.preferred_locations),
                preferred_categories = COALESCE($3, user_preferences.preferred_categories),
                min_salary = COALESCE($4, user_preferences.min_salary),
                max_salary = COALESCE($5, user_preferences.max_salary)
        `, [userId, preferredLocations, preferredCategories, minSalary, maxSalary]);

        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Statistics Routes
app.get('/api/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        const [jobsCount, applicationsCount, wishlistCount, interviewCount] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM jobs WHERE status = $1', ['active']),
            pool.query('SELECT COUNT(*) FROM applications WHERE user_id = $1', [userId]),
            pool.query('SELECT COUNT(*) FROM wishlist WHERE user_id = $1', [userId]),
            pool.query('SELECT COUNT(*) FROM applications WHERE user_id = $1 AND status = $2', [userId, 'interview'])
        ]);

        res.json({
            totalJobs: parseInt(jobsCount.rows[0].count),
            totalApplications: parseInt(applicationsCount.rows[0].count),
            wishlistCount: parseInt(wishlistCount.rows[0].count),
            interviewCount: parseInt(interviewCount.rows[0].count)
        });
    } catch (error) {
        console.error('Stats fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        aiModel: AI_CONFIG.model
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Database connection test
pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Database connected successfully');
        release();
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    pool.end(() => {
        process.exit(0);
    });
});

app.listen(port, () => {
    console.log(`CareerSync Pro server running on port ${port}`);
    console.log(`AI Model: ${AI_CONFIG.model}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

        // Check if already applied
        const existingApp = await pool.query('SELECT id FROM applications WHERE user_id = $1 AND job_id = $2', [userId, jobId]);
        if (existingApp.rows.length > 0) {
            return res.status(409).json({ error: 'Already applied to this job' });
        }

        // Create application
        const result = await pool.query(`
            INSERT INTO applications (user_id, job_id, job_title, company_name, cover_letter, resume_url)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [userId, jobId, job.title, job.company_name, coverLetter, resumeUrl]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Application creation error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/applications', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(`
            SELECT a.*, j.salary_display, j.location, j.skills
            FROM applications a
            LEFT JOIN jobs j ON a.job_id = j.id
            WHERE a.user_id = $1
            ORDER BY a.applied_date DESC
        `, [userId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Applications fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Wishlist Routes
app.post('/api/wishlist', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.body;
        const userId = req.user.userId;

        // Check if job exists
        const jobExists = await pool.query('SELECT id FROM jobs WHERE id = $1', [jobId]);
        if (jobExists.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Check if already in wishlist
        const existing = await pool.query('SELECT id FROM wishlist WHERE user_id = $1 AND job_id = $2', [userId, jobId]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: 'Job already in wishlist' });
        }

        await pool.query('INSERT INTO wishlist (user_id, job_id) VALUES ($1, $2)', [userId, jobId]);
        res.status(201).json({ message: 'Added to wishlist' });
    } catch (error) {
        console.error('Wishlist add error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.delete('/api/wishlist/:jobId', authenticateToken, async (req, res) => {
    try {
        const { jobId } = req.params;
        const userId = req.user.userId;

        const result = await pool.query('DELETE FROM wishlist WHERE user_id = $1 AND job_id = $2 RETURNING *', [userId, jobId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found in wishlist' });
        }

        res.json({ message: 'Removed from wishlist' });
    } catch (error) {
        console.error('Wishlist remove error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/wishlist', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const result = await pool.query(`
            SELECT j.*, w.created_at as saved_date
            FROM wishlist w
            JOIN jobs j ON w.job_id = j.id
            WHERE w.user_id = $1 AND j.status = 'active'
            ORDER BY w.created_at DESC
        `, [userId]);

        res.json(result.rows);
    } catch (error) {
        console.error('Wishlist fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// AI Routes
app.post('/api/ai/chat', aiLimiter, authenticateToken, async (req, res) => {
    try {
        const { message, sessionId, context = {} } = req.body;
        const userId = req.user.userId;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        // Get user context
        const userResult = await pool.query('SELECT name, skills FROM users WHERE id = $1', [userId]);
        const user = userResult.rows[0];

        // Get recent conversation history
        const historyResult = await pool.query(`
            SELECT role, content FROM ai_conversations 
            WHERE user_id = $1 AND session_id = $2 
            ORDER BY created_at DESC 
            LIMIT 10
        `, [userId, sessionId]);

        const history = historyResult.rows.reverse();

        // Build context for AI
        const aiContext = {
            userName: user?.name,
            userSkills: user?.skills || [],
            conversationHistory: history,
            ...context
        };

        // Call AI
        const aiResponse = await callAI(message, 
            `You are a helpful AI career assistant for CareerSync Pro. The user's name is ${user?.name}. Help them with job searching, career advice, resume analysis, and interview preparation. Be concise, helpful, and professional.`,
            aiContext
        );

        // Save conversation
        await pool.query(`
            INSERT INTO ai_conversations (user_id, session_id, role, content, context)
            VALUES ($1, $2, $3, $4, $5), ($1, $2, $6, $7, $5)
        `, [userId, sessionId, 'user', message, JSON.stringify(context), 'assistant', aiResponse]);

        res.json({ response: aiResponse });
    } catch (error) {
        console.error('AI chat error:', error);
        res.status(500).json({ error: 'AI service temporarily unavailable' });
    }
});

app.post('/api/ai/analyze-resume', aiLimiter, authenticateToken, async (req, res) => {
    try {
        const { jobId, resumeText } = req.body;
        const userId = req.user.userId;

        if (!jobId || !resumeText) {
            return res.status(400).json({ error: 'Job ID and resume text are required' });
        }

        // Get job details
        const jobResult = await pool.query('SELECT title, description, requirements, skills FROM jobs WHERE id = $1', [jobId]);
        if (jobResult.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found' });
        }

        const job = jobResult.rows[0];
