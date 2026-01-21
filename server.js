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
    if (!data) return;
    // Only set if not already set, or if data provides a non-empty value
    if (data.openrouter_key) process.env.OPENROUTER_API_KEY = data.openrouter_key;
    if (data.pinterest_token) process.env.PINTEREST_ACCESS_TOKEN = data.pinterest_token;
    if (data.pinterest_board) process.env.PINTEREST_BOARD_ID = data.pinterest_board;
    if (data.website_url) process.env.WEBSITE_URL = data.website_url;
    if (data.openrouter_model) process.env.OPENROUTER_MODEL = data.openrouter_model;
    if (data.pinterest_app_id) process.env.PINTEREST_APP_ID = data.pinterest_app_id;
    if (data.pinterest_app_secret) process.env.PINTEREST_APP_SECRET = data.pinterest_app_secret;
    // Important: handle both boolean and string values for sandbox
    const sandboxValue = data.pinterest_sandbox;
    process.env.PINTEREST_SANDBOX = (sandboxValue === true || sandboxValue === 'true') ? 'true' : 'false';

    console.log('🔧 Environment setup:');
    console.log('   Sandbox mode:', process.env.PINTEREST_SANDBOX);
};

// --- Pinterest OAuth Flow ---

app.get('/auth/pinterest', (req, res) => {
    const { client_id, client_secret, sandbox } = req.query;

    // Trim and validate inputs
    const cleanId = (client_id || '').trim();
    const cleanSecret = (client_secret || '').trim();

    if (!cleanId || !cleanSecret) {
        return res.status(400).send(`
            <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #fff5f5;">
                <h2 style="color: #c53030;">❌ Configuration Error</h2>
                <p>App ID or App Secret is missing. Please check your Settings.</p>
                <button onclick="window.close()" style="margin-top: 20px; padding: 12px 24px; background: #4a5568; color: white; border: none; border-radius: 8px;">Close</button>
            </body>
            </html>
        `);
    }

    console.log('🔑 Step 1: Initiating Pinterest OAuth...');
    console.log('   App ID:', cleanId);
    console.log('   Sandbox Mode:', sandbox === 'true');

    const stateData = Buffer.from(JSON.stringify({
        client_id: cleanId,
        client_secret: cleanSecret,
        sandbox: sandbox === 'true'
    })).toString('base64');

    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host;
    const redirect_uri = `${protocol}://${host}/callback`;

    console.log('   Redirect URI:', redirect_uri);

    const scopes = 'boards:read,boards:write,pins:read,pins:write,user_accounts:read';
    const authUrl = `https://www.pinterest.com/oauth/?client_id=${cleanId}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=code&scope=${scopes}&state=${stateData}`;

    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code, error, error_description, state } = req.query;

    console.log('📥 Step 2: Callback received from Pinterest');
    console.log('   Has code:', !!code);
    console.log('   Has error:', !!error);

    // Handle Pinterest authorization errors (Step 1 failures)
    if (error) {
        console.error('❌ Pinterest Authorization Error:', error, error_description);

        let errorMsg = error_description || error;
        let hints = [];

        if (error === 'access_denied') {
            hints.push('You clicked "Cancel" or "Deny" on Pinterest');
            hints.push('Click Connect again and approve the permissions');
        } else if (error === 'invalid_request' || error === 'invalid_client') {
            hints.push('Your App ID is incorrect or your app is not active');
            hints.push('Double-check your App ID in Pinterest Developer Portal');
        } else if (error.includes('redirect_uri')) {
            hints.push('Redirect URI mismatch!');
            hints.push(`Add EXACTLY this URI to your Pinterest App: https://pin-cover-auto.vercel.app/callback`);
        } else {
            hints.push('Check your Pinterest App settings');
            hints.push('Ensure your app is not in Draft mode');
        }

        return res.status(400).send(`
            <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #fff5f5;">
                <h2 style="color: #c53030;">❌ Pinterest Authorization Failed (Step 1)</h2>
                <div style="background: white; padding: 25px; border-radius: 12px; border: 2px solid #feb2b2; display: inline-block; text-align: left; max-width: 600px; margin: 20px;">
                    <p><strong>Error:</strong> <code style="background: #f7fafc; padding: 5px; border-radius: 3px;">${error}</code></p>
                    <p><strong>Description:</strong> ${errorMsg}</p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;">
                    <p style="color: #2c5282;"><strong>💡 What this means:</strong></p>
                    <ul style="color: #4a5568; margin-left: 20px;">
                        ${hints.map(h => `<li>${h}</li>`).join('')}
                    </ul>
                </div>
                <br>
                <button onclick="window.close()" style="padding: 12px 24px; background: #4a5568; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px;">Close & Fix Settings</button>
            </body>
            </html>
        `);
    }

    if (!code) {
        return res.status(400).send(`
            <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #fff5f5;">
                <h2 style="color: #c53030;">❌ No Authorization Code</h2>
                <p>Pinterest did not return an authorization code. Please try again.</p>
                <button onclick="window.close()" style="padding: 12px 24px; background: #4a5568; color: white; border: none; border-radius: 8px;">Close</button>
            </body>
            </html>
        `);
    }

    let client_id, client_secret, sandbox;
    try {
        if (!state) throw new Error('Missing state parameter');
        const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
        client_id = decodedState.client_id;
        client_secret = decodedState.client_secret;
        sandbox = decodedState.sandbox;

        if (!client_id || !client_secret) {
            throw new Error('State missing credentials');
        }
    } catch (e) {
        console.error('❌ State decode error:', e.message);
        return res.status(400).send(`
            <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #fff5f5;">
                <h2 style="color: #c53030;">❌ Session Error</h2>
                <p>Could not recover your app credentials. Please try connecting again.</p>
                <p style="font-size: 0.9em; color: #718096;">Error: ${e.message}</p>
                <button onclick="window.close()" style="padding: 12px 24px; background: #4a5568; color: white; border: none; border-radius: 8px;">Close</button>
            </body>
            </html>
        `);
    }

    try {
        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const host = req.headers.host;
        const redirect_uri = `${protocol}://${host}/callback`;

        console.log('🔄 Exchanging code for token...');
        console.log('   Client ID:', client_id);
        console.log('   Redirect URI:', redirect_uri);

        const auth = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

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
        const errorData = error.response?.data || {};
        const statusCode = error.response?.status || 500;
        console.error('❌ OAuth Error Details:', JSON.stringify(errorData, null, 2));
        console.error('   Status Code:', statusCode);

        let detail = typeof errorData === 'string' ? errorData : (errorData.error_description || errorData.message || JSON.stringify(errorData));
        let hints = [];

        if (statusCode === 401 || detail.includes('invalid_client')) {
            hints.push("Your App ID or App Secret is incorrect");
            hints.push("Check your Pinterest Developer dashboard for the correct credentials");
        }
        if (detail.includes('redirect_uri')) {
            hints.push("Redirect URI mismatch detected!");
            hints.push("Add 'https://pin-cover-auto.vercel.app/callback' to your Pinterest App's Redirect URIs");
        }
        if (!hints.length) {
            hints.push("Copy the error detail below and check Pinterest documentation");
        }

        res.status(statusCode).send(`
            <html>
            <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #fff5f5;">
                <h2 style="color: #c53030;">❌ Pinterest Connection Failed</h2>
                <div style="background: white; padding: 25px; border-radius: 12px; border: 2px solid #feb2b2; display: inline-block; text-align: left; max-width: 600px; margin: 20px;">
                    <p><strong>Error Code:</strong> <span style="color: #e53e3e; font-family: monospace;">${statusCode}</span></p>
                    <p><strong>Pinterest Says:</strong><br><code style="background: #f7fafc; padding: 10px; display: block; margin-top: 5px; border-radius: 5px; color: #2d3748; word-wrap: break-word;">${detail}</code></p>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                    <p style="color: #2c5282;"><strong>💡 What to check:</strong></p>
                    <ul style="color: #4a5568; margin-left: 20px;">
                        ${hints.map(h => `<li>${h}</li>`).join('')}
                    </ul>
                </div>
                <br>
                <button onclick="window.close()" style="margin-top: 20px; padding: 12px 24px; cursor: pointer; background: #4a5568; color: white; border: none; border-radius: 8px; font-size: 16px;">Close & Retry</button>
            </body>
            </html>
        `);
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
        const errData = error.response?.data || {};
        const message = errData.message || (typeof errData === 'string' ? errData : JSON.stringify(errData)) || error.message;
        res.status(500).json({ success: false, error: { message: message } });
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
