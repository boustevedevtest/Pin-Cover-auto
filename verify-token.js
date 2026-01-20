import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const token = process.argv[2] || process.env.PINTEREST_ACCESS_TOKEN;

if (!token) {
    console.error('❌ Aucun token trouvé. Utilisation: node verify-token.js <ton_token>');
    process.exit(1);
}

console.log('🔍 Vérification de ton Token Pinterest...');

async function checkToken() {
    try {
        const response = await axios.get('https://api.pinterest.com/v5/user_account', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('✅ Connexion réussie !');
        console.log('👤 Compte:', response.data.username);

        // Vérifier les permissions (scopes)
        // Note: L'API v5 ne renvoie pas toujours les scopes dans cette requête, 
        // mais si elle réussit, c'est déjà un bon début.

        console.log('\n🚀 Ton token est VALIDE pour la lecture.');
        console.log('Si le post échoue encore, c\'est que "pins:write" n\'est pas activé sur CE token spécifique.');

    } catch (error) {
        console.error('❌ Erreur de Token:', error.response?.data?.message || error.message);
        if (error.response?.data?.code === 3) {
            console.log('\n💡 Conseil: Pinterest dit que ce token n\'a pas assez de droits.');
            console.log('Regénère un token sur https://developers.pinterest.com/apps/ et coche TOUT.');
        }
    }
}

checkToken();
