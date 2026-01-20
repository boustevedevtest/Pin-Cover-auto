/**
 * Example: Generate and Post a Pin to Pinterest
 * 
 * Edit the configuration below and run: node generate-pin.js
 */

import { generateAndPostPin } from './pinterest-poster.js';

// ============================================
// CONFIGURE YOUR PIN HERE
// ============================================

const pinConfig = {
    // Topic for ChatGPT to generate SEO content
    topic: "Easy Chocolate Chip Cookies Recipe",

    // Two images for the poster
    image1: "./images/cookies-top.jpg",
    image2: "./images/cookies-bottom.jpg",

    // Link where the pin will redirect
    link: "https://omarecipes.com/chocolate-chip-cookies",

    // Language: 'en' (English), 'fr' (French), 'ar' (Arabic)
    language: "en"
};

// ============================================
// RUN THE AUTOMATION
// ============================================

console.log("═══════════════════════════════════════════");
console.log("    🎨 Pinterest Auto Poster with AI SEO   ");
console.log("═══════════════════════════════════════════\n");

const result = await generateAndPostPin(pinConfig);

if (result.success) {
    console.log("═══════════════════════════════════════════");
    console.log("    ✅ PIN POSTED SUCCESSFULLY!            ");
    console.log("═══════════════════════════════════════════");
    console.log(`\n🔗 View your pin: ${result.pinUrl}`);
    console.log(`📁 Image saved: ${result.imagePath}`);
    console.log(`\n📝 SEO Content Used:`);
    console.log(`   Title: ${result.seoContent.title}`);
    console.log(`   Hashtags: ${result.seoContent.hashtags.slice(0, 5).map(h => '#' + h).join(' ')}`);
} else {
    console.log("═══════════════════════════════════════════");
    console.log("    ❌ POSTING FAILED                      ");
    console.log("═══════════════════════════════════════════");
    console.log(`\nError: ${result.error}`);
}
