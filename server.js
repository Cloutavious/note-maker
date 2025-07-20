// server.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
// const nodemailer = require('nodemailer'); // REMOVED: No longer using Nodemailer
const Anthropic = require('@anthropic-ai/sdk'); // Using Anthropic Claude API

const app = express();
const port = process.env.PORT || 3000;

// --- CORS Configuration ---
// This is critical to allow your GitHub Pages frontend to communicate with your Render backend.
const corsOptions = {
  origin: 'https://cloutavious.github.io', // Your EXACT GitHub Pages URL
  methods: ['GET', 'POST'], // Allow both GET and POST requests
  allowedHeaders: ['Content-Type'], // Allow Content-Type header
  optionsSuccessStatus: 200 // For older browsers
};
app.use(cors(corsOptions)); // Apply the specific CORS options middleware

app.use(bodyParser.json());

// Initialize the Anthropic client using the ANTHROPIC_API_KEY environment variable
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY, // Reads from the environment variable set on Render
});

// REMOVED: Nodemailer transporter setup (no longer sending email from backend)
// const transporter = nodemailer.createTransport({
//     service: 'gmail',
//     auth: {
//         user: process.env.EMAIL_AUTH_USER,
//         pass: process.env.EMAIL_AUTH_PASS
//     }
// });

app.post('/api/generate', async (req, res) => {
    const { school, grade, subject, topic, format, notes_pages, papers_pages, email } = req.body;

    // Basic validation
    if (!school || !grade || !subject || !topic || !notes_pages || !papers_pages || !email) {
        return res.status(400).json({ error: 'All form fields are required.' });
    }

    try {
        // Construct the prompt for Claude
        const prompt = `
        You are a helpful assistant for students.
        Based on the following request, generate comprehensive notes and a practice question paper.

        Student Request Details:
        School: ${school}
        Grade: ${grade}
        Subject: ${subject}
        Topic: ${topic}
        Desired Notes Length: Approximately ${notes_pages} pages
        Desired Question Paper Length: Approximately ${papers_pages} pages
        Question Paper Formats (if specified): ${format}

        ---
        Please provide the content in two distinct sections:

        **Section 1: Notes**
        Generate comprehensive study notes for the specified topic, suitable for the given grade level. Structure the notes logically with clear headings and subheadings. Ensure the content covers key concepts, definitions, formulas (if applicable), and important examples.

        **Section 2: Question Paper**
        Create a practice question paper based on the notes and topic. Include a variety of question types if specified (${format}). Ensure the difficulty is appropriate for the grade level. Provide clear instructions and allocate marks for each question. Include an answer key at the very end of this section.
        ---
        `;

        // Make the API call to Claude
        const response = await anthropic.messages.create({
            model: "claude-3-7-sonnet-20250219", // You can change this model if desired
            max_tokens: 4000, // Adjust based on expected output length
            messages: [{
                role: "user",
                content: prompt
            }]
        });

        // Extract the generated text from Claude's response
        const generatedContent = response.content[0].text;

        // Send the generated content back to the frontend
        res.status(200).json({
            message: 'Content generated successfully!',
            generatedText: generatedContent // Key to send content to frontend
        });

    } catch (error) {
        console.error('Error processing request in backend:', error.response ? error.response.data : error.message);
        const errorMessage = error.response && error.response.data && error.response.data.error && error.response.data.error.message
            ? error.response.data.error.message
            : 'Error generating content. Please try again.';
        res.status(500).json({ error: errorMessage });
    }
});

// Simple GET route for health check
app.get('/', (req, res) => {
    res.send('Student Helper Backend is running!');
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
