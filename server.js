// server.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const nodemailer = require('nodemailer');

// Import the Anthropic SDK
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for your GitHub Pages frontend
app.use(cors({
    origin: 'https://cloutavious.github.io/website.github.io/', // Ensure this matches your GitHub Pages URL
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json());

// Initialize the Anthropic client using the ANTHROPIC_API_KEY environment variable
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY, // Reads from the environment variable
});

// Nodemailer transporter setup (make sure these are also in your Render env variables)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_AUTH_USER,
        pass: process.env.EMAIL_AUTH_PASS
    }
});

app.post('/api/generate', async (req, res) => {
    const { school, grade, subject, topic, format, notes_pages, papers_pages, email } = req.body;

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
            model: "claude-3-7-sonnet-20250219", // You can choose "claude-3-opus-20240229" for highest quality, "claude-3-haiku-20240307" for fastest, or "claude-3-5-sonnet-20241022" as a good balance.
            max_tokens: 4000, // Adjust max_tokens based on expected output length (Claude tokens are different from Gemini/OpenAI). 4000 is a good starting point for a few pages.
            messages: [{
                role: "user",
                content: prompt
            }]
        });

        // Extract the generated text from Claude's response
        const generatedContent = response.content[0].text; // Claude's response content is an array

        // Send content via email
        const mailOptions = {
            from: process.env.EMAIL_AUTH_USER,
            to: email,
            subject: `Your Requested Notes & Question Paper for ${subject} - ${topic} (Grade ${grade})`,
            html: `
                <p>Dear student,</p>
                <p>Here are your requested notes and question paper:</p>
                <pre>${generatedContent}</pre>
                <p>Best regards,</p>
                <p>Your Student Helper</p>
            `
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Email sending error:', error);
                // Important: Only send 500 status if email sending is critical AND it's a server error
                // Otherwise, you might still want to return 200 if content was generated but email failed
                return res.status(500).json({ error: 'Failed to send email with generated content. Please check server logs.' });
            } else {
                console.log('Email sent: ' + info.response);
                res.status(200).json({ message: 'Notes and question paper sent to your email!' });
            }
        });

    } catch (error) {
        console.error('Error processing request:', error.response ? error.response.data : error.message);
        const errorMessage = error.response && error.response.data && error.response.data.error && error.response.data.error.message
            ? error.response.data.error.message
            : 'Error generating content. Please try again.';
        res.status(500).json({ error: errorMessage });
    }
});

app.get('/', (req, res) => {
    res.send('Student Helper Backend is running!');
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
