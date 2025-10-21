#!/bin/sh

# Script d'entrée pour le conteneur Docker
set -e

echo "🚀 Démarrage du RSS Véhicules Bot..."

# Vérifier que les variables d'environnement requises sont définies
if [ -z "$DISCORD_TOKEN" ]; then
    echo "❌ ERREUR: DISCORD_TOKEN n'est pas défini"
    exit 1
fi

# Créer les répertoires s'ils n'existent pas
mkdir -p /app/data /app/logs

# Générer le client Prisma
echo "📦 Génération du client Prisma..."
npx prisma generate

# Appliquer les migrations de base de données
echo "🗄️ Application des migrations de base de données..."
npx prisma db push

echo "✅ Initialisation terminée"
echo "🤖 Démarrage du bot..."

# Démarrer l'application
exec node dist/bot.js
