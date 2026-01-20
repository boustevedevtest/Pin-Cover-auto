# Pinterest Auto Poster with AI SEO

Système complet pour générer et poster automatiquement des pins Pinterest avec du contenu SEO optimisé par ChatGPT.

## 🚀 Fonctionnalités

- ✅ **Génération de contenu SEO** avec ChatGPT (titre, description, hashtags)
- ✅ **Création automatique d'images** Pinterest (1000x1500px)
- ✅ **Publication directe** sur Pinterest via l'API v5
- ✅ **Multi-langues** : Anglais, Français, Arabe
- ✅ **Interface web** pour création manuelle

## 📦 Installation

```bash
cd "/Users/steve/Documents/Pin Cover auto"
npm install
```

## 🔑 Configuration des clés API

1. Copie le fichier `.env.example` vers `.env`:
```bash
cp .env.example .env
```

2. Remplis tes clés API dans `.env`:

```env
# OpenAI API Key (obtenir sur https://platform.openai.com)
OPENAI_API_KEY=sk-xxx...

# Pinterest Access Token (obtenir sur https://developers.pinterest.com)
PINTEREST_ACCESS_TOKEN=pina_xxx...

# Pinterest Board ID (l'ID du tableau où poster)
PINTEREST_BOARD_ID=123456789...

# Ton site web
WEBSITE_URL=www.omarecipes.com
```

## 🔐 Obtenir les clés API

### OpenAI API Key
1. Va sur [platform.openai.com](https://platform.openai.com)
2. Crée un compte ou connecte-toi
3. Va dans API Keys → Create new secret key
4. Copie la clé (commence par `sk-`)

### Pinterest Access Token
1. Va sur [developers.pinterest.com](https://developers.pinterest.com)
2. Crée une application
3. Configure les permissions : `boards:read`, `pins:read`, `pins:write`
4. Génère un Access Token
5. Copie le token

### Pinterest Board ID
1. Va sur ton profil Pinterest
2. Ouvre le tableau où tu veux poster
3. L'ID est dans l'URL : `pinterest.com/xxx/board-name/` → utilise l'ID du tableau

## 📝 Utilisation

### Option 1: Script Node.js

Modifie `generate-pin.js` avec tes paramètres :

```javascript
const pinConfig = {
    topic: "Easy Chocolate Chip Cookies Recipe",
    image1: "./images/cookies-top.jpg",
    image2: "./images/cookies-bottom.jpg",
    link: "https://omarecipes.com/chocolate-chip-cookies",
    language: "en" // ou "fr", "ar"
};
```

Puis exécute :
```bash
npm run generate
```

### Option 2: Ligne de commande

```bash
node pinterest-poster.js "ton sujet" ./image1.jpg ./image2.jpg https://ton-lien.com en
```

### Option 3: Interface Web

Ouvre `generator.html` dans ton navigateur pour créer des images manuellement.

## 📁 Structure du projet

```
Pin Cover auto/
├── generator.html          # Interface web pour création manuelle
├── pinterest-poster.js     # Script principal (API + ChatGPT)
├── generate-pin.js         # Script d'exemple
├── package.json            # Dépendances Node.js
├── .env                    # Tes clés API (à créer)
├── .env.example            # Exemple de configuration
└── output/                 # Images générées (créé automatiquement)
```

## 🤖 Ce que fait ChatGPT

Pour chaque pin, ChatGPT génère :

1. **Titre SEO** (max 100 caractères)
   - Mots-clés à fort trafic
   - Mots déclencheurs émotionnels

2. **Description** (max 500 caractères)
   - Keywords pertinents
   - Call-to-action

3. **Hashtags** (5-10)
   - Optimisés pour la recherche Pinterest

4. **Alt Text** 
   - Pour l'accessibilité et le SEO

## 🌐 Multi-langues

```javascript
// Anglais
generateAndPostPin({ ..., language: "en" })

// Français  
generateAndPostPin({ ..., language: "fr" })

// Arabe
generateAndPostPin({ ..., language: "ar" })
```

## 📊 Output

Après chaque pin posté :
- Image sauvegardée dans `./output/`
- URL du pin affiché
- Contenu SEO utilisé affiché

## ⚠️ Limites

- Pinterest limite à ~50 pins/jour par compte
- OpenAI facture par token utilisé
- Les images doivent être en haute résolution

## 🆘 Troubleshooting

### "Invalid access token"
→ Régénère ton token Pinterest et vérifie les permissions

### "Board not found"
→ Vérifie que le Board ID est correct et que ton app a accès

### "Rate limit exceeded"
→ Attends quelques heures avant de reposter

## 📄 License

MIT - Libre d'utilisation commerciale et personnelle.
