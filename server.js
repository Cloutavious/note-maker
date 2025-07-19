```javascript
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// --- Middleware ---
// IMPORTANT: In a production environment, restrict CORS to your GitHub Pages domain for security.
// For now, allowing all origins for easier testing.
app.use(cors());
app.use(bodyParser.json());

// --- Environment Variables (Will be set on Render Dashboard) ---
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const EMAIL_SERVICE_HOST = process.env.EMAIL_SERVICE_HOST || 'smtp.gmail.com';
const EMAIL_SERVICE_PORT = process.env.EMAIL_SERVICE_PORT || 587; // 587 for STARTTLS, 465 for SSL
const EMAIL_AUTH_USER = process.env.EMAIL_AUTH_USER; // Your sending email (stapiso09@gmail.com)
const EMAIL_AUTH_PASS = process.env.EMAIL_AUTH_PASS; // Your Gmail App Password

// --- Nodemailer Transporter ---
const transporter = nodemailer.createTransport({
    host: EMAIL_SERVICE_HOST,
    port: EMAIL_SERVICE_PORT,
    secure: EMAIL_SERVICE_PORT === 465, // true for 465, false for other ports (like 587)
    auth: {
        user: EMAIL_AUTH_USER,
        pass: EMAIL_AUTH_PASS,
    },
});

// --- API Endpoint to handle form submissions ---
app.post('/api/generate', async (req, res) => {
    const { school, grade, subject, topic, format, notes_pages, papers_pages, email } = req.body;

    if (!GOOGLE_API_KEY) {
        console.error("Google API key is not set.");
        return res.status(500).json({ error: "Server configuration error: Google API key missing." });
    }
    if (!EMAIL_AUTH_USER || !EMAIL_AUTH_PASS) {
        console.error("Email credentials are not set.");
        return res.status(500).json({ error: "Server configuration error: Email credentials missing." });
    }

    const promptForLLM = `
    You are an educational content generator. Based on the student's request, provide comprehensive notes and a set of practice questions.
    
    Student Request Details:
    School: ${school}
    Grade: Grade ${grade}
    Subject: ${subject}
    Topic: ${topic}
    Requested Notes Pages: ${notes_pages} (aim for this length if possible, generate detailed content)
    Requested Question Paper Formats: ${format}
    Requested Question Paper Pages: ${papers_pages} (aim for this length if possible, generate a good number of questions)

    ---
    **Notes Section:**
    (Provide detailed, educational notes for the specified topic and subject. Organize clearly with headings, subheadings, and bullet points. Include key concepts, definitions, formulas, examples, and explanations. Focus on comprehensive coverage suitable for the given grade level. The content should be extensive enough to fill approximately ${notes_pages} printed pages if formatted reasonably.)

    ---
    **Question Paper Section:**
    (Create a varied question paper covering the specified subject and topic. Include questions in the specified formats: ${format}. For 'True/False' or 'Fill in the Blank', provide clear statements. For 'Structured' or 'Short', provide open-ended questions that require critical thinking or application of concepts. Aim for a sufficient number of questions to fill approximately ${papers_pages} printed pages. Provide questions only, followed by a separate 'Answer Key' section at the very end. Ensure questions are challenging but fair for the specified grade level.)
    `;

    try {
        // Call Google Gemini API
        const geminiResponse = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${GOOGLE_API_KEY}`,
            {
                contents: [{ parts: [{ text: promptForLLM }] }],
                generationConfig: {
                    maxOutputTokens: 8192, // Max tokens for Gemini 1.5 Pro, ensures ample content
                    temperature: 0.7 // Adjust for creativity vs. factualness (0.0 for more deterministic)
                }
            }
        );

        // Extract content from Gemini's response
        const generatedContent = geminiResponse.data.candidates[0].content.parts[0].text;

        // Simple parsing to separate Notes and Question Paper sections
        let notesContent = "Notes could not be extracted. Here is the full generated content:\n" + generatedContent;
        let questionPaperContent = "Question paper could not be extracted. Here is the full generated content:\n" + generatedContent;

        const notesSectionTag = '**Notes Section:**';
        const qpSectionTag = '**Question Paper Section:**';
        const answerKeyTag = '**Answer Key:**';

        const notesStart = generatedContent.indexOf(notesSectionTag);
        const qpStart = generatedContent.indexOf(qpSectionTag);
        const answerKeyStart = generatedContent.indexOf(answerKeyTag);

        if (notesStart !== -1) {
            let notesEnd = generatedContent.length;
            if (qpStart !== -1 && qpStart > notesStart) {
                notesEnd = qpStart;
            } else if (answerKeyStart !== -1 && answerKeyStart > notesStart) {
                notesEnd = answerKeyStart;
            }
            notesContent = generatedContent.substring(notesStart + notesSectionTag.length, notesEnd).trim();
        }

        if (qpStart !== -1) {
            let qpEnd = generatedContent.length;
            if (answerKeyStart !== -1 && answerKeyStart > qpStart) {
                qpEnd = answerKeyStart;
            }
            questionPaperContent = generatedContent.substring(qpStart + qpSectionTag.length, qpEnd).trim();

            if (answerKeyStart !== -1) {
                questionPaperContent += "\n\n**Answer Key:**\n" + generatedContent.substring(answerKeyStart + answerKeyTag.length).trim();
            }
        }

        // 4. Send Email to Stapiso (your email)
        const mailOptionsToStapiso = {
            from: EMAIL_AUTH_USER,
            to: 'stapiso09@gmail.com',
            subject: `New Request: ${subject} (Grade ${grade}) from ${school}`,
            html: `
                <p>A new request has been submitted:</p>
                <ul>
                    <li><strong>School:</strong> ${school}</li>
                    <li><strong>Grade:</strong> Grade ${grade}</li>
                    <li><strong>Subject:</strong> ${subject}</li>
                    <li><strong>Topic:</strong> ${topic}</li>
                    <li><strong>Question Paper Format(s):</strong> ${format || 'Not specified'}</li>
                    <li><strong>Requested Notes Pages:</strong> ${notes_pages}</li>
                    <li><strong>Requested Question Paper Pages:</strong> ${papers_pages}</li>
                    <li><strong>Student Email:</strong> ${email}</li>
                </ul>
                <hr>
                <h2>Generated Notes:</h2>
                <pre style="white-space: pre-wrap; word-wrap: break-word; font-family: monospace;">${notesContent}</pre>
                <hr>
                <h2>Generated Question Paper:</h2>
                <pre style="white-space: pre-wrap; word-wrap: break-word; font-family: monospace;">${questionPaperContent}</pre>
                <hr>
                <p>Generated by AI based on student request.</p>
            `,
        };

        // 5. Send Email to Student
        const mailOptionsToStudent = {
            from: EMAIL_AUTH_USER,
            to: email, // Student's email
            subject: `Your Requested Notes & Question Papers for ${subject}`,
            html: `
                <p>Dear Student,</p>
                <p>Here are the notes and question papers you requested for <strong>${subject} - ${topic} (Grade ${grade})</strong> from your school <strong>${school}</strong>.</p>
                <p>We hope this helps with your studies!</p>
                <hr>
                <h2>Notes:</h2>
                <pre style="white-space: pre-wrap; word-wrap: break-word; font-family: monospace;">${notesContent}</pre>
                <hr>
                <h2>Question Paper:</h2>
                <pre style="white-space: pre-wrap; word-wrap: break-word; font-family: monospace;">${questionPaperContent}</pre>
                <hr>
                <p>Sincerely,</p>
                <p>Your Study Helper Team</p>
                <p><small>This content was generated by an AI model and may contain inaccuracies. Please review it carefully.</small></p>
            `,
        };

        await transporter.sendMail(mailOptionsToStapiso);
        await transporter.sendMail(mailOptionsToStudent);

        console.log('Emails sent successfully!');
        res.json({ message: 'Request processed and emails sent successfully!' });

    } catch (error) {
        console.error('Error processing request:', error.response ? error.response.data : error.message);
        let errorMessage = 'Failed to process your request. Please try again.';
        if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
            errorMessage = `AI Generation Error: ${error.response.data.error.message}`;
        } else if (error.message.includes('ECONNECTION')) {
            errorMessage = 'Email sending error: Could not connect to email server. Check credentials/port.';
        } else if (error.message.includes('Authentication failed')) {
            errorMessage = 'Email sending error: Authentication failed. Check your App Password.';
        }
        res.status(500).json({ error: errorMessage });
    }
});

// Basic route for the root to avoid "Cannot GET /"
app.get('/', (req, res) => {
    res.send('Backend server is running. Send POST requests to /api/generate.');
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
```