# RSS Véhicules Bot

Bot Discord production-ready pour la surveillance des véhicules via flux RSS, avec notifications intelligentes et support multi-serveurs.

## 🚀 Fonctionnalités

- **Surveillance RSS** : Polling automatique des flux RSS avec jitter pour éviter la synchronisation
- **Notifications intelligentes** : 
  - Messages publics pour "Indisponible matériel" avec mentions de rôles
  - Messages privés pour "Disponible" (abonnements utilisateur)
- **Multi-serveurs** : Configuration indépendante par serveur Discord
- **Commandes slash** : Interface utilisateur intuitive en français
- **Observabilité** : Logs structurés, métriques et health checks
- **Déploiement Docker** : Support ARM64 pour Raspberry Pi 5

## 📋 Prérequis

- Node.js 20+
- Docker (optionnel)
- Token Discord Bot

## 🛠️ Installation

### Développement local

1. **Cloner le projet**
   ```bash
   git clone <repository-url>
   cd rss-vehicules-bot
   ```

2. **Installer les dépendances**
   ```bash
   npm install
   ```

3. **Configuration**
   ```bash
   cp env.example .env
   # Éditer .env avec vos paramètres
   ```

4. **Base de données**
   ```bash
   npm run db:generate
   npm run db:push
   ```

5. **Développement**
   ```bash
   npm run dev
   ```

### Docker

1. **Configuration**
   ```bash
   cp env.example .env
   # Éditer .env avec vos paramètres
   ```

2. **Démarrage**
   ```bash
   docker-compose up -d
   ```

## 🔧 Configuration

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Token du bot Discord | **Obligatoire** |
| `NODE_ENV` | Environnement | `production` |
| `LOG_LEVEL` | Niveau de logs | `info` |
| `DEFAULT_POLLING_SEC` | Intervalle de polling | `120` |
| `HTTP_TIMEOUT_MS` | Timeout HTTP | `10000` |
| `HTTP_MAX_RETRIES` | Tentatives HTTP | `3` |
| `PORT` | Port du serveur web | `8080` |

### Configuration Discord

1. Créer une application sur [Discord Developer Portal](https://discord.com/developers/applications)
2. Créer un bot et récupérer le token
3. Inviter le bot avec les permissions :
   - `Send Messages`
   - `Use Slash Commands`
   - `Embed Links`
   - `Read Message History`

## 📖 Commandes

### Commandes Administrateur

| Commande | Description |
|----------|-------------|
| `/ajout url:<url> nom:<string>` | Ajouter un véhicule |
| `/suppr nom:<string>` | Supprimer un véhicule |
| `/salon canal:<#channel>` | Définir le salon de notification |
| `/roles_ajouter roles:<@rôle...>` | Ajouter des rôles |
| `/roles_retirer roles:<@rôle...>` | Retirer des rôles |
| `/config_voir` | Afficher la configuration |
| `/polling sec:<int>` | Modifier l'intervalle (30-120s) |
| `/liste` | Lister les véhicules |
| `/statut nom:<string>` | Vérifier le statut |

### Commandes Utilisateur

| Commande | Description |
|----------|-------------|
| `/abonner nom:<string>` | S'abonner aux notifications MP |
| `/desabonner nom:<string>` | Se désabonner |
| `/mes` | Voir mes abonnements |
| `/vehicules` | Lister les véhicules |
| `/voir nom:<string>` | Voir le statut d'un véhicule |

## 🔄 Statuts supportés

Le bot normalise automatiquement les statuts :

- **Disponible** ✅
- **Indisponible matériel** 🔧 (notification publique)
- **Indisponible opérationnel** ⚠️
- **Désinfection en cours** 🧽
- **En intervention** 🚨
- **Retour service** 🔄
- **Hors service** ❌

## 📊 Observabilité

### Health Check
```bash
curl http://localhost:8080/healthz
```

### Métriques
```bash
curl http://localhost:8080/metrics
```

### Logs
Les logs sont structurés en JSON avec Pino :
```json
{
  "level": "info",
  "time": "2024-01-01T12:00:00.000Z",
  "msg": "Commande exécutée",
  "commandName": "ajout",
  "userId": "123456789",
  "guildId": "987654321"
}
```

## 🐳 Déploiement Docker

### Docker Compose

```yaml
version: '3.8'
services:
  bot:
    build: .
    container_name: rss-vehicules-bot
    restart: unless-stopped
    env_file: [.env]
    volumes:
      - ./data:/app/data
    ports:
      - "8080:8080"
```

### Portainer

1. Créer un stack dans Portainer
2. Utiliser le fichier `docker-compose.yml`
3. Configurer les variables d'environnement
4. Déployer

### Raspberry Pi 5

Le Dockerfile supporte ARM64 nativement :
```bash
docker build --platform linux/arm64 -t rss-vehicules-bot .
```

## 🧪 Tests

```bash
# Tests unitaires
npm test

# Tests avec couverture
npm run test:coverage

# Linting
npm run lint

# Formatage
npm run format
```

## 📁 Structure du projet

```
src/
├── bot.ts                 # Point d'entrée principal
├── env.ts                 # Configuration environnement
├── logger.ts              # Système de logs
├── discord/               # Client Discord et commandes
│   ├── client.ts
│   ├── commands_admin.ts
│   ├── commands_user.ts
│   ├── embeds.ts
│   └── guards.ts
├── rss/                   # Parser RSS et mapping
│   ├── fetch.ts
│   ├── parse.ts
│   └── map_monpompier.ts
├── core/                  # Logique métier
│   ├── scheduler.ts
│   ├── rules.ts
│   └── notify.ts
├── db/                    # Base de données
│   └── prisma.ts
├── web/                   # Serveur web
│   └── server.ts
└── util/                  # Utilitaires
    ├── status.ts
    └── jitter.ts
```

## 🔒 Sécurité

- Utilisateur non-root dans le conteneur
- Validation des entrées avec Zod
- Gestion des permissions Discord
- Logs d'audit pour toutes les actions

## 📈 Performance

- Polling avec jitter pour éviter la synchronisation
- Cache des états de véhicules
- Gestion des timeouts HTTP
- Limitation des ressources Docker

## 🐛 Dépannage

### Bot ne répond pas
1. Vérifier le token Discord
2. Vérifier les permissions du bot
3. Consulter les logs

### Notifications ne fonctionnent pas
1. Vérifier la configuration du salon
2. Vérifier les rôles mentionnés
3. Vérifier les abonnements utilisateur

### Erreurs de base de données
1. Vérifier les permissions du volume Docker
2. Vérifier la configuration SQLite
3. Consulter les logs d'erreur

## 📄 Licence

MIT License - Voir le fichier LICENSE pour plus de détails.

## 🤝 Contribution

1. Fork le projet
2. Créer une branche feature
3. Commiter les changements
4. Pousser vers la branche
5. Ouvrir une Pull Request

## 📞 Support

Pour toute question ou problème :
- Ouvrir une issue sur GitHub
- Consulter la documentation
- Vérifier les logs du bot