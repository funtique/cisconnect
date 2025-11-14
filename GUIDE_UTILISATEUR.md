# 📖 Guide Utilisateur - CIS Connect Bot

Guide complet pour utiliser toutes les commandes du bot Discord CIS Connect.

## 📋 Table des matières

1. [Premiers pas](#premiers-pas)
2. [Commandes Administrateur](#commandes-administrateur)
3. [Commandes Utilisateur](#commandes-utilisateur)
4. [Exemples d'utilisation](#exemples-dutilisation)
5. [FAQ](#faq)

---

## 🚀 Premiers pas

### 1. Inviter le bot sur votre serveur

Le bot doit être invité avec les permissions suivantes :
- Envoyer des messages
- Utiliser les commandes slash
- Intégrer des liens
- Lire l'historique des messages

### 2. Configuration initiale (Administrateur uniquement)

Avant d'utiliser le bot, un administrateur doit configurer le serveur avec la commande `/setup`.

---

## 👑 Commandes Administrateur

Ces commandes nécessitent les permissions d'administrateur sur le serveur Discord.

### `/setup`

**Description** : Configure le bot pour votre serveur Discord. Cette commande doit être exécutée en premier.

**Paramètres** :
- `channel` (obligatoire) : Le salon Discord où les notifications seront envoyées
- `role_maintenance` (obligatoire) : Le rôle Discord qui sera mentionné pour les notifications de maintenance
- `poll_seconds` (optionnel) : L'intervalle de vérification des flux RSS en secondes (défaut : 60, minimum : 30, maximum : 300)

**Exemple** :
```
/setup channel:#notifications role_maintenance:@Maintenance poll_seconds:60
```

**Ce que fait la commande** :
- Enregistre le salon de notifications
- Enregistre le rôle de maintenance
- Configure l'intervalle de polling
- Affiche un résumé de la configuration

**Réponse** : Un embed Discord avec :
- ✅ Le salon configuré
- ✅ Le rôle de maintenance
- ✅ L'intervalle de polling
- ℹ️ Un avertissement si le rôle n'est pas mentionnable

**Note** : Si le rôle n'est pas mentionnable, pensez à l'autoriser dans les paramètres du serveur pour que les mentions fonctionnent.

---

### `/add_vehicle`

**Description** : Ajoute un véhicule à surveiller via son flux RSS.

**Paramètres** :
- `rss_url` (obligatoire) : L'URL du flux RSS du véhicule
- `vehicle_name` (obligatoire) : Le nom du véhicule (ex: "FS 1 Istres")

**Exemple** :
```
/add_vehicle rss_url:https://monpompier.com/flux/vehicules/2206.xml vehicle_name:"FS 1 Istres"
```

**Ce que fait la commande** :
- Vérifie que la configuration du serveur existe (sinon demande de faire `/setup` d'abord)
- Valide que l'URL commence par `http://` ou `https://`
- Vérifie que le véhicule n'existe pas déjà
- Crée un identifiant unique basé sur le nom (minuscules, espaces remplacés par `_`)
- Enregistre le véhicule dans la base de données

**Réponse** :
- ✅ `Véhicule "[nom]" ajouté avec succès !` si tout s'est bien passé
- ❌ Messages d'erreur si :
  - La configuration n'existe pas
  - L'URL est invalide
  - Le véhicule existe déjà

**Exemples d'URLs valides** :
- `https://monpompier.com/flux/vehicules/2206.xml`
- `http://example.com/rss/vehicle.xml`

**Note** : Le nom du véhicule peut contenir des espaces et sera automatiquement converti en identifiant (ex: "FS 1 Istres" → `fs_1_istres`).

---

### `/list_vehicles`

**Description** : Liste tous les véhicules configurés pour le serveur.

**Paramètres** : Aucun

**Exemple** :
```
/list_vehicles
```

**Ce que fait la commande** :
- Récupère tous les véhicules configurés pour le serveur
- Les trie par nom
- Affiche les 10 premiers dans un embed

**Réponse** :
- Un embed Discord avec :
  - 🚗 Titre "Véhicules configurés"
  - Liste des véhicules avec leur nom et URL RSS
  - Un footer indiquant s'il y a plus de 10 véhicules
- ℹ️ Message si aucun véhicule n'est configuré

**Format de l'affichage** :
```
🚗 Véhicules configurés

Liste:
• FS 1 Istres
  https://monpompier.com/flux/vehicules/2206.xml
• FS 2 Istres
  https://monpompier.com/flux/vehicules/2207.xml
```

---

## 👤 Commandes Utilisateur

Ces commandes peuvent être utilisées par tous les membres du serveur.

### `/test`

**Description** : Teste la connexion et la réactivité du bot.

**Paramètres** : Aucun

**Exemple** :
```
/test
```

**Ce que fait la commande** :
- Vérifie que le bot répond aux commandes
- Teste la connexion Discord

**Réponse** :
- ✅ `Test réussi !` si le bot fonctionne correctement

**Utilisation** : Utilisez cette commande si vous pensez que le bot ne répond pas, pour vérifier qu'il est en ligne.

---

## 📝 Exemples d'utilisation

### Scénario 1 : Configuration initiale d'un nouveau serveur

1. **Inviter le bot** sur le serveur Discord
2. **Créer un salon** pour les notifications (ex: `#notifications`)
3. **Créer un rôle** pour la maintenance (ex: `@Maintenance`)
4. **Exécuter `/setup`** :
   ```
   /setup channel:#notifications role_maintenance:@Maintenance poll_seconds:60
   ```
5. **Vérifier la configuration** avec le message de confirmation

### Scénario 2 : Ajouter plusieurs véhicules

1. **Ajouter le premier véhicule** :
   ```
   /add_vehicle rss_url:https://monpompier.com/flux/vehicules/2206.xml vehicle_name:"FS 1 Istres"
   ```

2. **Ajouter un deuxième véhicule** :
   ```
   /add_vehicle rss_url:https://monpompier.com/flux/vehicules/2207.xml vehicle_name:"FS 2 Istres"
   ```

3. **Vérifier la liste** :
   ```
   /list_vehicles
   ```

### Scénario 3 : Vérifier la configuration

1. **Tester la connexion** :
   ```
   /test
   ```

2. **Voir les véhicules** :
   ```
   /list_vehicles
   ```

---

## ❓ FAQ

### Q: Pourquoi je ne vois pas les commandes dans Discord ?

**R:** Les commandes slash peuvent prendre 1-2 minutes pour apparaître après l'invitation du bot. Si elles n'apparaissent toujours pas :
- Vérifiez que le bot est en ligne
- Réinvitez le bot avec les bonnes permissions
- Utilisez `/test` pour vérifier la connexion

### Q: Je reçois une erreur "Configuration générale manquante"

**R:** Vous devez d'abord exécuter `/setup` avant d'ajouter des véhicules. La commande `/setup` configure le serveur avec le salon de notifications et le rôle de maintenance.

### Q: Puis-je modifier la configuration après `/setup` ?

**R:** Oui, vous pouvez réexécuter `/setup` avec de nouveaux paramètres. La configuration sera mise à jour.

### Q: Que se passe-t-il si j'ajoute deux fois le même véhicule ?

**R:** Le bot détectera que le véhicule existe déjà (basé sur le nom converti en identifiant) et vous affichera un message d'erreur.

### Q: Puis-je utiliser des URLs RSS autres que monpompier.com ?

**R:** Oui, le bot accepte n'importe quelle URL RSS valide commençant par `http://` ou `https://`.

### Q: Comment supprimer un véhicule ?

**R:** Cette fonctionnalité n'est pas encore implémentée dans la version actuelle. Pour le moment, vous devrez modifier la base de données directement ou attendre une mise à jour.

### Q: Le bot ne répond pas aux commandes

**R:** Vérifiez :
1. Que le bot est en ligne (statut vert dans Discord)
2. Que vous avez les permissions nécessaires (admin pour `/setup` et `/add_vehicle`)
3. Les logs du bot dans Portainer pour des erreurs

### Q: Puis-je changer l'intervalle de polling après la configuration ?

**R:** Oui, réexécutez `/setup` avec un nouveau `poll_seconds`. L'intervalle doit être entre 30 et 300 secondes.

### Q: Que signifie "Le rôle n'est pas mentionnable" ?

**R:** Discord permet de rendre un rôle non mentionnable pour éviter le spam. Si vous voulez que le bot puisse mentionner le rôle de maintenance, allez dans les paramètres du serveur → Rôles → Activez "Autoriser les mentions de ce rôle".

---

## 🔗 Ressources

- [Documentation Discord Slash Commands](https://discord.com/developers/interactions/application-commands)
- [Format RSS](https://fr.wikipedia.org/wiki/RSS)
- [Support GitHub](https://github.com/funtique/cisconnect)

---

**Besoin d'aide ?** Ouvrez une issue sur GitHub ou consultez les logs du bot dans Portainer.

