import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { generateAndPostPin, generatePinContent, generatePosterImage, createPin } from './pinterest-poster.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'generator.html'));
});

// Helper to update process.env temporarily for a request
const setupEnv = (data) => {
    if (data.openrouter_key) process.env.OPENROUTER_API_KEY = data.openrouter_key;
    if (data.pinterest_token) process.env.PINTEREST_ACCESS_TOKEN = data.pinterest_token;
    if (data.pinterest_board) process.env.PINTEREST_BOARD_ID = data.pinterest_board;
    if (data.website_url) process.env.WEBSITE_URL = data.website_url;
    if (data.openrouter_model) process.env.OPENROUTER_MODEL = data.openrouter_model;
    if (data.pinterest_app_id) process.env.PINTEREST_APP_ID = data.pinterest_app_id;
    if (data.pinterest_app_secret) process.env.PINTEREST_APP_SECRET = data.pinterest_app_secret;
    if (data.pinterest_sandbox !== undefined) process.env.PINTEREST_SANDBOX = data.pinterest_sandbox;
};

// --- Pinterest OAuth Flow ---

app.get('/auth/pinterest', (req, res) => {
    const { client_id, client_secret, sandbox } = req.query;
    if (!client_id || !client_secret) return res.status(400).send('Missing App ID or Secret');

    // On Vercel (serverless), process.env is not persistent between requests.
    // We pass credentials through the 'state' parameter (Base64 encoded)
    const stateData = Buffer.from(JSON.stringify({
        client_id,
        client_secret,
        sandbox: sandbox === 'true'
    })).toString('base64');

    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const redirect_uri = `${protocol}://${host}/callback`;

    const scopes = 'boards:read,boards:write,pins:read,pins:write,user_accounts:read';
    const authUrl = `https://www.pinterest.com/oauth/?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=code&scope=${scopes}&state=${stateData}`;

    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code, error, state } = req.query;
    if (error) return res.status(400).send(`Pinterest Error: ${error}`);
    if (!code) return res.status(400).send('No code received');

    let client_id, client_secret, sandbox;
    try {
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
        client_id = decodedState.client_id;
        client_secret = decodedState.client_secret;
        sandbox = decodedState.sandbox;
    } catch (e) {
        return res.status(400).send('Invalid state parameter');
    }

    try {
        console.log('🔄 Exchanging code for token...');
        const auth = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host;
        const redirect_uri = `${protocol}://${host}/callback`;

        const response = await axios.post('https://api.pinterest.com/v5/oauth/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirect_uri
            }),
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const token = response.data.access_token;
        console.log('✅ Token received successfully!');

        res.send(`
            <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h2 style="color: #38a169;">✅ Pinterest Connection Success!</h2>
                <script>
                    window.opener.postMessage({ type: 'PINTEREST_TOKEN', token: '${token}' }, '*');
                    setTimeout(() => window.close(), 2000);
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        const errorData = error.response?.data || error.message;
        console.error('❌ OAuth Error:', errorData);
        res.status(500).send(`Auth Error: ${JSON.stringify(errorData)}`);
    }
});

// Route to list Pinterest boards
app.get('/api/list-boards', async (req, res) => {
    const token = req.query.token;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    try {
        const sandbox = req.query.sandbox === 'true' || process.env.PINTEREST_SANDBOX === 'true';
        const baseUrl = sandbox ? 'https://api-sandbox.pinterest.com' : 'https://api.pinterest.com';

        const response = await axios.get(`${baseUrl}/v5/boards`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        res.json({ success: true, boards: response.data.items });
    } catch (error) {
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
});

// Route to only generate SEO content
app.post('/api/generate-only', async (req, res) => {
    console.log('🤖 Generating SEO content for preview...');
    try {
        const { title, config, language } = req.body;
        setupEnv(config);
        const seoContent = await generatePinContent(title, language || config.language || 'en');
        res.json({ success: true, seoContent });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Route to post to Pinterest
app.post('/api/post-pin', async (req, res) => {
    console.log('\n🚀 --- New Post Attempt ---');
    try {
        const { imageData, title, description, hashtags, altText, websiteUrl, config } = req.body;
        setupEnv(config);

        if (!process.env.PINTEREST_ACCESS_TOKEN || process.env.PINTEREST_ACCESS_TOKEN === 'undefined') {
            throw new Error('Pinterest Token is missing. Please connect first.');
        }

        if (!config.pinterest_board) {
            throw new Error('Pinterest Board ID is missing. Please enter it in Settings ⚙️');
        }

        // Save image (using /tmp for Vercel if needed, but let's see)
        const base64Data = imageData.replace(/^data:image\/jpeg;base64,/, "");
        const timestamp = Date.now();
        const outputDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, 'output');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const imagePath = path.join(outputDir, `pin_${timestamp}.jpg`);
        fs.writeFileSync(imagePath, base64Data, 'base64');

        // Use provided content or generate if missing
        let finalTitle = title;
        let finalDesc = description;
        let finalHash = hashtags;
        let finalAlt = altText;

        if (!finalDesc) {
            console.log('🤖 Content missing, generating with AI...');
            const seo = await generatePinContent(title, config.language || 'en');
            if (!finalTitle) finalTitle = seo.title;
            finalDesc = seo.description;
            finalHash = seo.hashtags;
            finalAlt = seo.altText;
        }

        let finalLink = websiteUrl.trim();
        if (!finalLink || finalLink === 'https://' || finalLink === 'http://') {
            finalLink = config.website_url || 'https://www.omarecipes.com';
        }
        if (!finalLink.startsWith('http')) {
            finalLink = `https://${finalLink}`;
        }

        console.log('📌 Posting to Pinterest Board:', config.pinterest_board);
        const result = await createPin({
            title: finalTitle,
            description: finalDesc,
            hashtags: Array.isArray(finalHash) ? finalHash : finalHash.split(',').map(h => h.trim()),
            altText: finalAlt,
            imagePath: imagePath,
            link: finalLink
        });

        res.json({ success: true, pinUrl: `https://pinterest.com/pin/${result.id}`, finalTitle });
    } catch (error) {
        const errorData = error.response?.data || error.message;
        console.error('❌ Detailed Error:', JSON.stringify(errorData, null, 2));
        res.status(500).json({
            success: false,
            error: typeof errorData === 'object' ? (errorData.message || JSON.stringify(errorData)) : errorData
        });
    }
});

app.listen(PORT, () => {
    console.log(`\n✅ Pinterest Bridge Server running at http://localhost:${PORT}`);
});

export default app;
