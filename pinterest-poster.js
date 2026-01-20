/**
 * Pinterest Auto Poster with AI-Generated SEO Content
 * 
 * This script:
 * 1. Uses OpenRouter to generate SEO-optimized pin title, description, and hashtags
 * 2. Creates a Pinterest-ready poster image using Sharp
 * 3. Posts the pin to Pinterest via API
 */

import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURATION (Dynamic Getter)
// ============================================

const getConfig = () => ({
    openrouterApiKey: process.env.OPENROUTER_API_KEY,
    openrouterModel: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
    pinterestAccessToken: process.env.PINTEREST_ACCESS_TOKEN,
    pinterestBoardId: process.env.PINTEREST_BOARD_ID,
    websiteUrl: process.env.WEBSITE_URL || 'www.omarecipes.com',

    // Design constants
    canvasWidth: 1000,
    canvasHeight: 1500,
    bannerHeight: 330
});

// ============================================
// OPENROUTER - Generate SEO Content
// ============================================

/**
 * Generate SEO-optimized pin content using OpenRouter
 */
export async function generatePinContent(topic, language = 'en') {
    const config = getConfig();
    console.log(`🤖 Generating SEO content with OpenRouter (${config.openrouterModel})...`);

    const systemPrompt = `You are a Pinterest SEO expert specializing in food and recipes. Generate highly optimized content for Pinterest pins.

Your output must be in JSON format with these fields:
- title: A catchy, SEO-optimized title (max 100 characters)
- description: Write a Pinterest-ready, SEO-optimized recipe card description. 
  Include:
  1. Rating & Reviews: Show stars and number of reviews (e.g., ⭐⭐⭐⭐⭐ 4.9 • 1,248 reviews) - vary the numbers naturally.
  2. Short intro: Highlight that the recipe is healthy, easy, flavorful, low-carb or gluten-free, and perfect for weeknights.
- hashtags: Array of 5-10 relevant hashtags without the # symbol
- altText: SEO-friendly alt text for the image (max 100 characters)

Return ONLY valid JSON.`;

    const userPrompt = `Generate Pinterest SEO content for a pin about: "${topic}"
    
Language: ${language === 'ar' ? 'Arabic' : language === 'fr' ? 'French' : 'English'}

The pin will link to: ${config.websiteUrl}

Return ONLY valid JSON, no markdown.`;

    try {
        const response = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: config.openrouterModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 500
            },
            {
                headers: {
                    'Authorization': `Bearer ${config.openrouterApiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': config.websiteUrl.startsWith('http') ? config.websiteUrl : `https://${config.websiteUrl}`,
                    'X-Title': 'Pinterest Auto Poster'
                }
            }
        );

        const content = response.data.choices[0].message.content;

        // Parse JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const pinContent = JSON.parse(jsonMatch[0]);
            console.log('✅ SEO content generated successfully!');
            return pinContent;
        }

        throw new Error('Invalid JSON response from OpenRouter');
    } catch (error) {
        const errorMsg = error.response?.data?.error?.message || error.message;
        console.error('❌ Error generating content:', errorMsg);
        throw new Error(errorMsg);
    }
}

// ============================================
// IMAGE GENERATION (using Sharp)
// ============================================

/**
 * Create SVG text overlay
 */
function createTextSVG(title, websiteUrl, width, height) {
    const titleUpper = title.toUpperCase();

    // Split title into lines if too long
    const maxCharsPerLine = 25;
    let lines = [];

    if (titleUpper.length > maxCharsPerLine) {
        const words = titleUpper.split(' ');
        let currentLine = '';

        for (const word of words) {
            if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
                currentLine = (currentLine + ' ' + word).trim();
            } else {
                if (currentLine) lines.push(currentLine);
                currentLine = word;
            }
        }
        if (currentLine) lines.push(currentLine);
    } else {
        lines = [titleUpper];
    }

    // Calculate font size based on text length
    let fontSize = 72;
    if (lines.some(l => l.length > 20)) fontSize = 60;
    if (lines.some(l => l.length > 25)) fontSize = 50;

    const lineHeight = fontSize * 1.3;
    const totalTextHeight = lines.length * lineHeight;
    const startY = (height - totalTextHeight) / 2 + fontSize / 2;

    // Generate title text elements
    const titleElements = lines.map((line, i) =>
        `<text x="${width / 2}" y="${startY + i * lineHeight}" 
               text-anchor="middle" 
               font-family="Impact, Arial Black, sans-serif" 
               font-size="${fontSize}" 
               font-weight="bold" 
               fill="#4B6F44">${escapeXml(line)}</text>`
    ).join('\n');

    // Website URL element
    const urlElement = websiteUrl ?
        `<text x="${width / 2}" y="${height - 40}" 
               text-anchor="middle" 
               font-family="Arial, sans-serif" 
               font-size="32" 
               font-weight="bold" 
               fill="#E07B39">${escapeXml(websiteUrl)}</text>` : '';

    return `
        <svg width="${width}" height="${height}">
            <rect width="${width}" height="${height}" fill="white"/>
            ${titleElements}
            ${urlElement}
        </svg>
    `;
}

function escapeXml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Generate Pinterest poster image using Sharp
 */
export async function generatePosterImage(title, image1Path, image2Path, outputPath) {
    const config = getConfig();
    console.log('🎨 Generating poster image...');

    const { canvasWidth, canvasHeight, bannerHeight, websiteUrl } = config;
    const halfHeight = canvasHeight / 2;
    const bannerY = Math.floor((canvasHeight - bannerHeight) / 2);

    try {
        // Process top image
        const img1Buffer = await sharp(image1Path)
            .resize(canvasWidth, halfHeight, { fit: 'cover', position: 'center' })
            .toBuffer();

        // Process bottom image
        const img2Buffer = await sharp(image2Path)
            .resize(canvasWidth, halfHeight, { fit: 'cover', position: 'center' })
            .toBuffer();

        // Create text banner as SVG
        const bannerSVG = createTextSVG(title, websiteUrl, canvasWidth, bannerHeight);
        const bannerBuffer = Buffer.from(bannerSVG);

        // Compose final image
        const result = await sharp({
            create: {
                width: canvasWidth,
                height: canvasHeight,
                channels: 3,
                background: { r: 255, g: 255, b: 255 }
            }
        })
            .composite([
                { input: img1Buffer, top: 0, left: 0 },
                { input: img2Buffer, top: halfHeight, left: 0 },
                { input: bannerBuffer, top: bannerY, left: 0 }
            ])
            .jpeg({ quality: 95 })
            .toFile(outputPath);

        console.log(`✅ Poster saved: ${outputPath}`);
        return outputPath;

    } catch (error) {
        console.error('❌ Error generating image:', error.message);
        throw error;
    }
}

// ============================================
// PINTEREST API
// ============================================

/**
 * Create a pin on Pinterest
 */
export async function createPin(pinData) {
    const config = getConfig();
    console.log('📌 Creating pin on Pinterest...');

    const { title, description, hashtags, altText, imagePath, link } = pinData;

    // Format description with hashtags
    const fullDescription = `${description}\n\n${hashtags.map(h => `#${h}`).join(' ')}`;

    try {
        // Read image as base64
        const imageBuffer = fs.readFileSync(imagePath);
        const base64Image = imageBuffer.toString('base64');

        const response = await axios.post(
            'https://api.pinterest.com/v5/pins',
            {
                board_id: config.pinterestBoardId,
                title: title,
                description: fullDescription,
                alt_text: altText,
                link: link,
                media_source: {
                    source_type: 'image_base64',
                    content_type: 'image/jpeg',
                    data: base64Image
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${config.pinterestAccessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('✅ Pin created successfully!');
        console.log('   Pin ID:', response.data.id);
        console.log('   URL:', `https://pinterest.com/pin/${response.data.id}`);

        return response.data;
    } catch (error) {
        console.error('❌ Pinterest API error:', error.response?.data || error.message);
        throw error;
    }
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Generate and post a pin to Pinterest
 */
export async function generateAndPostPin(options) {
    const { topic, image1, image2, link, language = 'en' } = options;

    console.log('\n🚀 Starting Pinterest Auto Poster...\n');
    console.log(`Topic: ${topic}`);
    console.log(`Language: ${language}`);
    console.log(`Link: ${link}\n`);

    try {
        // Step 1: Generate SEO content with ChatGPT
        const seoContent = await generatePinContent(topic, language);
        console.log('\n📝 Generated Content:');
        console.log(`   Title: ${seoContent.title}`);
        console.log(`   Description: ${seoContent.description.substring(0, 50)}...`);
        console.log(`   Hashtags: ${seoContent.hashtags.join(', ')}\n`);

        // Step 2: Generate poster image
        const timestamp = Date.now();
        const outputDir = path.join(process.cwd(), 'output');
        const outputPath = path.join(outputDir, `pin_${timestamp}.jpg`);

        // Ensure output directory exists
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        await generatePosterImage(seoContent.title, image1, image2, outputPath);

        // Step 3: Post to Pinterest
        const pinResult = await createPin({
            title: seoContent.title,
            description: seoContent.description,
            hashtags: seoContent.hashtags,
            altText: seoContent.altText,
            imagePath: outputPath,
            link: link
        });

        console.log('\n🎉 SUCCESS! Pin posted to Pinterest!');
        console.log(`   View at: https://pinterest.com/pin/${pinResult.id}\n`);

        return {
            success: true,
            pinId: pinResult.id,
            pinUrl: `https://pinterest.com/pin/${pinResult.id}`,
            seoContent,
            imagePath: outputPath
        };

    } catch (error) {
        console.error('\n❌ FAILED:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================
// CLI USAGE
// ============================================

const scriptName = process.argv[1];
if (scriptName && scriptName.endsWith('pinterest-poster.js')) {
    const args = process.argv.slice(2);

    if (args.length < 4) {
        console.log(`
Pinterest Auto Poster - Usage:
  node pinterest-poster.js <topic> <image1> <image2> <link> [language]

Example:
  node pinterest-poster.js "chocolate cake recipe" ./images/cake1.jpg ./images/cake2.jpg https://omarecipes.com/chocolate-cake en
        `);
        process.exit(1);
    }

    generateAndPostPin({
        topic: args[0],
        image1: args[1],
        image2: args[2],
        link: args[3],
        language: args[4] || 'en'
    });
}
