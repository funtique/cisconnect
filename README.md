# 🔥 CIS Connect Bot

Bot Discord pour la surveillance des véhicules de pompiers via flux RSS.

## ✨ Fonctionnalités

- **Multi-véhicules** : Surveille plusieurs véhicules par serveur Discord
- **Base de données SQLite** : Stockage local des configurations et véhicules
- **Configuration par serveur** : Chaque serveur Discord a sa propre configuration
- **Commandes slash** : Interface intuitive en français
- **Déploiement Docker** : Prêt pour Portainer et Raspberry Pi

## 🚀 Installation

### Déploiement avec Portainer (Recommandé)

1. **Créer un stack dans Portainer**
   - Choisir "Repository" (Git repository)
   - URL : `https://github.com/funtique/cisconnect.git`
   - Compose path : `compose.yml`
   - Repository reference : `refs/heads/main`

2. **Configurer les variables d'environnement**
   - `DISCORD_TOKEN` : Token du bot Discord (obligatoire)
   - `OWNER_ID` : Votre ID utilisateur Discord (obligatoire)
   - `DB_PATH` : `/data/cisconnect.db` (par défaut)
   - `POLL_SECONDS` : `60` (par défaut, entre 30 et 300)
   - `HTTP_TIMEOUT` : `10` (par défaut)
   - `HTTP_UA` : `CISConnectBot/1.0` (par défaut)
   - `LOG_LEVEL` : `INFO` (par défaut)

3. **Déployer la stack**

### Développement local

1. **Cloner le repository**
   ```bash
   git clone https://github.com/funtique/cisconnect.git
   cd cisconnect
   ```

2. **Créer le fichier .env**
   ```bash
   cp env.example .env
   # Éditer .env avec votre DISCORD_TOKEN
   ```

3. **Lancer avec Docker Compose**
   ```bash
   docker compose up -d
   ```

4. **Vérifier les logs**
   ```bash
   docker compose logs -f
   ```

## 🔧 Configuration Discord

1. Créer une application sur [Discord Developer Portal](https://discord.com/developers/applications)
2. Créer un bot et récupérer le token
3. Inviter le bot avec les permissions :
   - `Send Messages`
   - `Use Slash Commands`
   - `Embed Links`
   - `Read Message History`
   - `Manage Messages` (optionnel)

## 📖 Commandes

Voir [GUIDE_UTILISATEUR.md](GUIDE_UTILISATEUR.md) pour la documentation complète des commandes.

### Commandes disponibles

**Commandes Administrateur :**
- `/setup` - Configurer le bot pour le serveur
- `/add_vehicle` - Ajouter un véhicule à surveiller
- `/list_vehicles` - Lister les véhicules configurés
- `/resync` - Forcer la resynchronisation des commandes

**Commandes Utilisateur :**
- `/test` - Tester la connexion du bot
- `/status` - Voir le statut actuel d'un véhicule
- `/subscribe` - S'abonner aux notifications MP d'un véhicule
- `/unsubscribe` - Se désabonner des notifications d'un véhicule
- `/my_subscriptions` - Voir mes abonnements

## 🏗️ Architecture

```
src/
├── bot_simple.py      # Bot principal avec commandes
└── __init__.py

docker/
├── Dockerfile         # Image Docker Python
└── entrypoint.sh      # Script de démarrage
```

## 🐳 Docker

### Dockerfile

Le Dockerfile utilise Python 3.11-slim avec :
- discord.py 2.4.0
- aiosqlite pour la base de données
- python-dotenv pour les variables d'environnement

### Volumes

- `/data` : Stockage de la base de données SQLite

## 📊 Base de données

La base de données SQLite stocke :
- **guild_configs** : Configuration par serveur (salon, rôle maintenance, polling)
- **vehicles** : Liste des véhicules par serveur (nom, URL RSS)

## 🔄 Workflow

1. **Configuration initiale** : Utiliser `/setup` pour configurer le serveur
2. **Ajout de véhicules** : Utiliser `/add_vehicle` pour ajouter des flux RSS
3. **Vérification** : Utiliser `/list_vehicles` pour voir les véhicules configurés

## 🐛 Dépannage

### Bot ne répond pas
1. Vérifier le token Discord dans les variables d'environnement
2. Vérifier les permissions du bot sur le serveur
3. Consulter les logs dans Portainer

### Commandes ne s'affichent pas
1. Attendre 1-2 minutes (synchronisation Discord)
2. Réinviter le bot si nécessaire
3. Vérifier les logs pour des erreurs de synchronisation

### Erreurs de base de données
1. Vérifier les permissions du volume Docker (`/data`)
2. Vérifier que le chemin `DB_PATH` est correct
3. Consulter les logs d'erreur

## 📝 Logs

Les logs sont affichés dans la console et peuvent être consultés via :
- Portainer : Section "Logs" du conteneur
- Docker Compose : `docker compose logs -f`

## 🔒 Sécurité

- Variables d'environnement pour les secrets
- Validation des permissions Discord
- Validation des entrées utilisateur

## 📄 Licence

MIT License - Voir le fichier LICENSE pour plus de détails.

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature
3. Commiter les changements
4. Push vers la branche
5. Ouvrir une Pull Request

---

**Développé avec ❤️ pour la surveillance des véhicules de pompiers** 🔥
