#!/usr/bin/env python3
"""
Bot Discord pour la surveillance des véhicules via flux RSS
"""
import sys
print("=" * 60)
print("🚀 Démarrage du bot CIS Connect...")
print(f"🐍 Python version: {sys.version}")
print("=" * 60)

import discord
from discord import app_commands
from discord.ext import tasks
import os
import aiosqlite
import feedparser
import aiohttp
from pathlib import Path
from dotenv import load_dotenv
from datetime import datetime
import hashlib

load_dotenv()

# Configuration
DB_PATH = os.getenv('DB_PATH', '/data/cisconnect.db')
HTTP_TIMEOUT = int(os.getenv('HTTP_TIMEOUT', '10'))
HTTP_UA = os.getenv('HTTP_UA', 'CISConnectBot/1.0')

intents = discord.Intents.default()
intents.guilds = True
# Note: Pour envoyer des MP, pas besoin de l'intent members
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)

async def init_db():
    """Initialise la base de données"""
    db_dir = Path(DB_PATH).parent
    db_dir.mkdir(parents=True, exist_ok=True)
    
    async with aiosqlite.connect(DB_PATH) as db:
        # Table de configuration des serveurs
        await db.execute('''
            CREATE TABLE IF NOT EXISTS guild_configs (
                guild_id TEXT PRIMARY KEY,
                channel_id TEXT,
                role_maintenance_id TEXT,
                poll_seconds INTEGER DEFAULT 60
            )
        ''')
        # Table des véhicules
        await db.execute('''
            CREATE TABLE IF NOT EXISTS vehicles (
                guild_id TEXT,
                vehicle_id TEXT,
                rss_url TEXT,
                vehicle_name TEXT,
                PRIMARY KEY (guild_id, vehicle_id)
            )
        ''')
        # Table des états des véhicules
        await db.execute('''
            CREATE TABLE IF NOT EXISTS vehicle_states (
                guild_id TEXT,
                vehicle_id TEXT,
                last_status TEXT,
                last_seen_at TEXT,
                last_payload_hash TEXT,
                notified_available INTEGER DEFAULT 0,
                PRIMARY KEY (guild_id, vehicle_id)
            )
        ''')
        # Table des abonnements
        await db.execute('''
            CREATE TABLE IF NOT EXISTS subscriptions (
                guild_id TEXT,
                user_id TEXT,
                vehicle_id TEXT,
                PRIMARY KEY (guild_id, user_id, vehicle_id)
            )
        ''')
        await db.commit()

def normalize_status(status: str) -> str:
    """Normalise le statut du véhicule"""
    if not status:
        return "Inconnu"
    status_lower = status.lower().strip()
    
    # Statuts normalisés
    if "disponible" in status_lower and "indisponible" not in status_lower:
        return "Disponible"
    elif "indisponible" in status_lower and "matériel" in status_lower:
        return "Indisponible matériel"
    elif "indisponible" in status_lower:
        return "Indisponible opérationnel"
    elif "désinfection" in status_lower:
        return "Désinfection en cours"
    elif "intervention" in status_lower or "sur les lieux" in status_lower:
        return "En intervention"
    elif "retour" in status_lower or "retour service" in status_lower:
        return "Retour service"
    elif "hors service" in status_lower:
        return "Hors service"
    
    # Si le statut contient juste le nom du véhicule ou des données brutes, retourner "Inconnu"
    # pour éviter d'afficher le nom du véhicule comme statut
    if len(status_lower) < 3 or "istres" in status_lower or "fs" in status_lower:
        return "Inconnu"
    
    # Si le statut n'est pas reconnu, logger pour pouvoir l'ajouter plus tard
    print(f"⚠️ Statut non reconnu: '{status}' - Ajoutez-le à la fonction normalize_status si nécessaire")
    
    # Retourner le statut tel quel (capitalisé) pour l'afficher quand même
    # Cela permet de voir les nouveaux statuts et de les ajouter à la normalisation
    return status.strip().capitalize()

async def fetch_rss(url: str) -> tuple[dict, str | None]:
    """Récupère le contenu RSS"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url,
                headers={'User-Agent': HTTP_UA},
                timeout=aiohttp.ClientTimeout(total=HTTP_TIMEOUT)
            ) as response:
                if response.status == 200:
                    content = await response.text()
                    return {'status': response.status}, content
                return {'status': response.status}, None
    except Exception as e:
        print(f"❌ Erreur fetch RSS {url}: {e}")
        return {}, None

def extract_status_from_description(description: str) -> str:
    """Extrait le statut réel depuis une description HTML/brute"""
    if not description:
        return ""
    
    import re
    
    # Nettoyer le HTML
    status = re.sub(r'<[^>]+>', '', description)
    
    # Pattern pour extraire le statut après "est :" ou ":"
    # Exemple: "le FS 1 Istres est : Sur les lieux"
    patterns = [
        r'est\s*:\s*(.+?)(?:\.|$)',  # "est : [statut]"
        r':\s*(.+?)(?:\.|$)',         # ": [statut]"
    ]
    
    for pattern in patterns:
        match = re.search(pattern, status, re.IGNORECASE)
        if match:
            extracted_status = match.group(1).strip()
            # Nettoyer le statut extrait
            extracted_status = re.sub(r'\d+[/-]\d+[/-]\d+', '', extracted_status)  # Enlever les dates
            extracted_status = re.sub(r'%[^%]*%', '', extracted_status)  # Enlever les pourcentages
            extracted_status = extracted_status.strip()
            
            if len(extracted_status) > 2:
                # Normaliser le statut extrait
                return normalize_status(extracted_status)
    
    # Si aucun pattern "est :" trouvé, chercher des mots-clés de statut dans le texte
    status_lower = status.lower()
    
    # Mots-clés de statut possibles
    status_keywords = [
        ("disponible", "Disponible"),
        ("indisponible matériel", "Indisponible matériel"),
        ("indisponible opérationnel", "Indisponible opérationnel"),
        ("indisponible", "Indisponible opérationnel"),
        ("désinfection", "Désinfection en cours"),
        ("intervention", "En intervention"),
        ("sur les lieux", "En intervention"),
        ("retour service", "Retour service"),
        ("hors service", "Hors service"),
    ]
    
    # Chercher le premier mot-clé trouvé
    for keyword, normalized in status_keywords:
        if keyword in status_lower:
            return normalized
    
    # Si aucun mot-clé trouvé, retourner une version nettoyée
    cleaned = re.sub(r'\d+[/-]\d+[/-]\d+', '', status)
    cleaned = re.sub(r'%[^%]*%', '', cleaned)
    cleaned = re.sub(r'\d+', '', cleaned)
    cleaned = re.sub(r'[^\w\s]', ' ', cleaned)
    cleaned = ' '.join(cleaned.split())
    
    return cleaned[:100] if cleaned else ""

def parse_rss(content: str) -> list[dict]:
    """Parse le contenu RSS et retourne les items"""
    try:
        feed = feedparser.parse(content)
        items = []
        for entry in feed.entries[:5]:  # Prendre les 5 plus récents
            title = entry.get('title', '')
            description = entry.get('description', '')
            
            # Extraire le statut depuis la description
            status = extract_status_from_description(description)
            
            # Si pas de statut trouvé dans la description, utiliser le titre
            if not status or len(status) < 3:
                status = extract_status_from_description(title) if title else ""
            
            # Si toujours rien, utiliser le titre brut nettoyé
            if not status or len(status) < 3:
                import re
                status = re.sub(r'<[^>]+>', '', title)
                status = re.sub(r'\d+[/-]\d+[/-]\d+', '', status)  # Enlever les dates
                status = ' '.join(status.split())
                status = status.strip()
            
            items.append({
                'status': status,
                'description': description,
                'title': title,
                'published': entry.get('published', ''),
                'link': entry.get('link', '')
            })
        return items
    except Exception as e:
        print(f"❌ Erreur parse RSS: {e}")
        import traceback
        traceback.print_exc()
        return []

def generate_hash(content: str) -> str:
    """Génère un hash du contenu pour détecter les changements"""
    return hashlib.sha256(content.encode()).hexdigest()

@client.event
async def on_ready():
    print("=" * 60)
    print(f"🔗 Connecté en tant que {client.user}")
    print(f"🆔 ID du bot: {client.user.id}")
    print("=" * 60)
    
    # Initialiser la base de données
    try:
        print("🗄️ Initialisation de la base de données...")
        await init_db()
        print(f"✅ Base de données initialisée (chemin: {DB_PATH})")
    except Exception as e:
        print(f"❌ Erreur DB: {e}")
        import traceback
        traceback.print_exc()
    
    # Synchronisation des commandes
    try:
        # Récupérer le premier serveur configuré pour la synchronisation instantanée
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute('SELECT guild_id FROM guild_configs LIMIT 1')
            guild_row = await cursor.fetchone()
            
            if guild_row:
                guild_id_str = guild_row[0]
                try:
                    guild_id = int(guild_id_str)
                    guild = client.get_guild(guild_id)
                    
                    if guild:
                        print(f"🔄 Synchronisation des commandes sur le serveur de développement: {guild.name} (ID: {guild_id})")
                        # Nettoyer d'abord les commandes spécifiques au serveur pour éviter les doublons
                        tree.clear_commands(guild=guild)
                        # Copier les commandes globales vers le serveur
                        tree.copy_global_to(guild=guild)
                        # Synchroniser sur ce serveur (instantané, évite le cache)
                        synced_guild = await tree.sync(guild=guild)
                        print(f"✅ {len(synced_guild)} commandes synchronisées instantanément sur le serveur de développement")
                        print("💡 Les commandes sont disponibles immédiatement sur ce serveur (pas d'attente de cache)")
                        
                        # Ensuite, synchronisation globale pour les autres serveurs
                        print("🔄 Synchronisation globale des commandes (pour les autres serveurs)...")
                        synced_global = await tree.sync()
                        print(f"✅ {len(synced_global)} commandes synchronisées globalement (disponibles sur tous les autres serveurs)")
                    else:
                        print(f"⚠️ Serveur {guild_id} introuvable, synchronisation globale uniquement...")
                        synced_global = await tree.sync()
                        print(f"✅ {len(synced_global)} commandes synchronisées globalement")
                        for cmd in synced_global:
                            print(f"  - /{cmd.name}: {cmd.description}")
                except (ValueError, TypeError):
                    print("⚠️ ID de serveur invalide, synchronisation globale uniquement...")
                    synced_global = await tree.sync()
                    print(f"✅ {len(synced_global)} commandes synchronisées globalement")
                    for cmd in synced_global:
                        print(f"  - /{cmd.name}: {cmd.description}")
            else:
                # Pas de serveur configuré, synchronisation globale uniquement
                print("🔄 Synchronisation globale des commandes...")
                synced_global = await tree.sync()
                print(f"✅ {len(synced_global)} commandes synchronisées globalement")
                for cmd in synced_global:
                    print(f"  - /{cmd.name}: {cmd.description}")
    except Exception as e:
        print(f"❌ Erreur sync: {e}")
        import traceback
        traceback.print_exc()
    
    # Vérifier la configuration avant de démarrer le polling
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute('SELECT COUNT(*) FROM guild_configs')
            config_count = (await cursor.fetchone())[0]
            print(f"📊 Configurations de serveur trouvées: {config_count}")
            
            if config_count == 0:
                print("⚠️ ATTENTION: Aucune configuration de serveur trouvée!")
                print("💡 Le polling ne s'exécutera pas tant qu'aucun serveur n'est configuré avec /setup")
            else:
                cursor = await db.execute('SELECT guild_id FROM guild_configs')
                guilds = await cursor.fetchall()
                print(f"📋 Serveurs configurés: {', '.join([g[0] for g in guilds])}")
    except Exception as e:
        print(f"⚠️ Erreur lors de la vérification de la configuration: {e}")
    
    # Démarrer le polling
    try:
        print("🚀 Démarrage du polling RSS...")
        poll_feeds.start()
        print("✅ Polling RSS démarré (s'exécutera toutes les 60 secondes)")
    except Exception as e:
        print(f"❌ Erreur démarrage polling: {e}")
        import traceback
        traceback.print_exc()
    
    print("=" * 60)
    print("✅ Bot prêt !")
    print("=" * 60)

@tasks.loop(seconds=60)
async def poll_feeds():
    """Polling automatique des flux RSS"""
    print(f"\n⏰ [POLLING] Démarrage du cycle de polling - {datetime.utcnow().isoformat()}")
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            # Récupérer toutes les configurations
            cursor = await db.execute('SELECT guild_id, poll_seconds FROM guild_configs')
            configs = await cursor.fetchall()
            
            if not configs:
                print("⚠️ Aucune configuration de serveur trouvée. Le polling ne s'exécutera pas.")
                print("💡 Utilisez la commande /setup pour configurer le bot.")
                return
            
            print(f"🔄 Polling démarré pour {len(configs)} serveur(s)")
            
            for guild_id, poll_seconds in configs:
                # Vérifier si on doit poller maintenant (simple round-robin)
                # Pour simplifier, on poll toutes les 60s par défaut
                # Le poll_seconds sera utilisé pour ajuster la fréquence
                
                # Récupérer les véhicules de ce serveur
                cursor = await db.execute('''
                    SELECT vehicle_id, rss_url, vehicle_name 
                    FROM vehicles 
                    WHERE guild_id = ?
                ''', (guild_id,))
                vehicles = await cursor.fetchall()
                
                for vehicle_id, rss_url, vehicle_name in vehicles:
                    try:
                        print(f"📡 Polling pour {vehicle_name} ({vehicle_id})...")
                        
                        # Récupérer l'état actuel
                        cursor = await db.execute('''
                            SELECT last_status, last_payload_hash, notified_available
                            FROM vehicle_states
                            WHERE guild_id = ? AND vehicle_id = ?
                        ''', (guild_id, vehicle_id))
                        state = await cursor.fetchone()
                        
                        old_status = state[0] if state else None
                        old_hash = state[1] if state else None
                        notified_available = state[2] if state else 0
                        
                        print(f"  📊 Statut actuel: {old_status or 'Aucun'}")
                        
                        # Fetch RSS
                        meta, content = await fetch_rss(rss_url)
                        if not content:
                            print(f"  ⚠️ Impossible de récupérer le contenu RSS pour {vehicle_name}")
                            continue
                        
                        print(f"  ✅ RSS récupéré ({len(content)} caractères)")
                        
                        # Générer le hash
                        content_hash = generate_hash(content)
                        
                        # Parser le RSS (toujours parser pour voir ce qui est dedans)
                        items = parse_rss(content)
                        if not items:
                            print(f"  ⚠️ Aucun item trouvé dans le RSS pour {vehicle_name}")
                            if old_hash == content_hash:
                                continue
                            else:
                                continue
                        
                        print(f"  📋 {len(items)} item(s) trouvé(s) dans le RSS")
                        
                        # Prendre le premier item (le plus récent)
                        latest = items[0]
                        print(f"  📄 Titre RSS: {latest.get('title', 'N/A')[:100]}")
                        print(f"  📄 Description RSS: {latest.get('description', 'N/A')[:200]}")
                        
                        new_status_raw = latest['status']
                        new_status = normalize_status(new_status_raw)
                        
                        print(f"  📝 Statut brut extrait: {new_status_raw[:200]}")
                        print(f"  ✅ Statut normalisé: {new_status}")
                        
                        # Si le statut actuel n'est pas normalisé (contient le nom du véhicule),
                        # forcer la mise à jour même si le hash n'a pas changé
                        needs_update = False
                        if old_status and old_status == old_status.upper() and "istres" in old_status.lower():
                            print(f"  🔄 Statut actuel semble être le nom du véhicule, mise à jour forcée")
                            needs_update = True
                        
                        # Si le contenu n'a pas changé ET que le statut est déjà normalisé, skip
                        if old_hash == content_hash and not needs_update:
                            print(f"  ⏭️ Contenu RSS inchangé, pas de mise à jour nécessaire")
                            continue
                        
                        # Mettre à jour l'état
                        now = datetime.utcnow().isoformat()
                        await db.execute('''
                            INSERT OR REPLACE INTO vehicle_states 
                            (guild_id, vehicle_id, last_status, last_seen_at, last_payload_hash, notified_available)
                            VALUES (?, ?, ?, ?, ?, ?)
                        ''', (guild_id, vehicle_id, new_status, now, content_hash, notified_available))
                        
                        print(f"  💾 Statut enregistré dans la base de données")
                        
                        # Détecter les changements et notifier
                        if old_status != new_status:
                            print(f"🔄 Changement détecté pour {vehicle_name}: {old_status} → {new_status}")
                            
                            # Récupérer la config du serveur
                            cursor = await db.execute('''
                                SELECT channel_id, role_maintenance_id
                                FROM guild_configs
                                WHERE guild_id = ?
                            ''', (guild_id,))
                            config = await cursor.fetchone()
                            
                            if config:
                                channel_id, role_id = config
                                
                                # Notification selon le statut
                                if new_status == "Disponible":
                                    # MP aux abonnés (une seule fois)
                                    if not notified_available:
                                        await notify_available(guild_id, vehicle_id, vehicle_name, new_status, db)
                                        await db.execute('''
                                            UPDATE vehicle_states
                                            SET notified_available = 1
                                            WHERE guild_id = ? AND vehicle_id = ?
                                        ''', (guild_id, vehicle_id))
                                
                                elif new_status == "Indisponible matériel":
                                    # Notification salon avec mention rôle
                                    if channel_id and role_id:
                                        await notify_maintenance(guild_id, channel_id, role_id, vehicle_name, new_status)
                                
                                # Réinitialiser notified_available si le véhicule redevient indisponible
                                if new_status != "Disponible" and notified_available:
                                    await db.execute('''
                                        UPDATE vehicle_states
                                        SET notified_available = 0
                                        WHERE guild_id = ? AND vehicle_id = ?
                                    ''', (guild_id, vehicle_id))
                        
                        await db.commit()
                        
                    except Exception as e:
                        print(f"❌ Erreur polling véhicule {vehicle_name}: {e}")
                        import traceback
                        traceback.print_exc()
                        continue
                        
    except Exception as e:
        print(f"❌ Erreur polling: {e}")
        import traceback
        traceback.print_exc()

async def notify_available(guild_id: str, vehicle_id: str, vehicle_name: str, status: str, db: aiosqlite.Connection):
    """Envoie des MP aux abonnés quand un véhicule devient disponible"""
    try:
        # Récupérer les abonnés
        cursor = await db.execute('''
            SELECT user_id FROM subscriptions
            WHERE guild_id = ? AND vehicle_id = ?
        ''', (guild_id, vehicle_id))
        subscribers = await cursor.fetchall()
        
        if not subscribers:
            return
        
        embed = discord.Embed(
            title="✅ Véhicule disponible",
            description=f"Le véhicule **{vehicle_name}** est maintenant **{status}**",
            color=0x00AA00,
            timestamp=datetime.utcnow()
        )
        embed.set_footer(text="Vous recevrez une notification uniquement la prochaine fois qu'il devient disponible")
        
        for (user_id,) in subscribers:
            try:
                # Utiliser get_user au lieu de get_member (pas besoin de l'intent members)
                user = client.get_user(int(user_id))
                if user:
                    await user.send(embed=embed)
                    print(f"📧 MP envoyé à {user.name} ({user_id}) pour {vehicle_name}")
                else:
                    # Si l'utilisateur n'est pas en cache, essayer de le fetch
                    try:
                        user = await client.fetch_user(int(user_id))
                        await user.send(embed=embed)
                        print(f"📧 MP envoyé à {user.name} ({user_id}) pour {vehicle_name}")
                    except:
                        print(f"⚠️ Utilisateur {user_id} introuvable")
            except discord.Forbidden:
                print(f"⚠️ Impossible d'envoyer MP à {user_id} (MP désactivées)")
            except Exception as e:
                print(f"❌ Erreur MP à {user_id}: {e}")
    except Exception as e:
        print(f"❌ Erreur notify_available: {e}")

async def notify_maintenance(guild_id: str, channel_id: str, role_id: str, vehicle_name: str, status: str):
    """Envoie une notification dans le salon avec mention du rôle"""
    try:
        guild = client.get_guild(int(guild_id))
        if not guild:
            return
        
        channel = guild.get_channel(int(channel_id))
        if not channel:
            return
        
        role = guild.get_role(int(role_id))
        if not role:
            return
        
        embed = discord.Embed(
            title="🔧 Indisponibilité matériel",
            description=f"Le véhicule **{vehicle_name}** est **{status}**",
            color=0xFF6600,
            timestamp=datetime.utcnow()
        )
        
        await channel.send(f"{role.mention}", embed=embed)
        print(f"📢 Notification salon pour {vehicle_name}")
    except Exception as e:
        print(f"❌ Erreur notify_maintenance: {e}")

# ===== COMMANDES EXISTANTES (PRESERVÉES) =====

@tree.command(name="test", description="Commande de test")
async def test(interaction: discord.Interaction):
    await interaction.response.send_message("✅ Test réussi !", ephemeral=True)

@tree.command(name="setup", description="Configurer le bot pour ce serveur")
@app_commands.checks.has_permissions(administrator=True)
async def setup(interaction: discord.Interaction, channel: discord.TextChannel, role_maintenance: discord.Role, poll_seconds: int = 60):
    if poll_seconds < 30 or poll_seconds > 300:
        await interaction.response.send_message("❌ L'intervalle de polling doit être entre 30 et 300 secondes", ephemeral=True)
        return
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''
            INSERT OR REPLACE INTO guild_configs (guild_id, channel_id, role_maintenance_id, poll_seconds)
            VALUES (?, ?, ?, ?)
        ''', (str(interaction.guild_id), str(channel.id), str(role_maintenance.id), poll_seconds))
        await db.commit()
    
    embed = discord.Embed(title="✅ Configuration enregistrée", color=0x00AA88)
    embed.add_field(name="Salon", value=f"<#{channel.id}>", inline=True)
    embed.add_field(name="Rôle maintenance", value=f"<@&{role_maintenance.id}>", inline=True)
    embed.add_field(name="Polling", value=f"{poll_seconds}s", inline=True)
    
    note = None
    try:
        if not role_maintenance.mentionable:
            note = "ℹ️ Le rôle n'est pas mentionnable. Pensez à l'autoriser si besoin."
    except Exception:
        pass
    
    await interaction.response.send_message(content=note, embed=embed, ephemeral=True)

@tree.command(name="add_vehicle", description="Ajouter un véhicule à surveiller")
@app_commands.checks.has_permissions(administrator=True)
async def add_vehicle(interaction: discord.Interaction, rss_url: str, vehicle_name: str):
    if not rss_url.startswith(('http://', 'https://')):
        await interaction.response.send_message("❌ L'URL RSS doit commencer par http:// ou https://", ephemeral=True)
        return
    
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('SELECT guild_id FROM guild_configs WHERE guild_id = ?', (str(interaction.guild_id),))
        config = await cursor.fetchone()
        if not config:
            await interaction.response.send_message("❌ Configuration générale manquante. Lancez d'abord `/setup`.", ephemeral=True)
            return
        
        vehicle_id = vehicle_name.lower().replace(" ", "_")
        cursor = await db.execute('''
            SELECT vehicle_name FROM vehicles 
            WHERE guild_id = ? AND vehicle_id = ?
        ''', (str(interaction.guild_id), vehicle_id))
        existing = await cursor.fetchone()
        if existing:
            await interaction.response.send_message(f"❌ Le véhicule `{existing[0]}` existe déjà avec cet ID.", ephemeral=True)
            return
        
        await db.execute('''
            INSERT INTO vehicles (guild_id, vehicle_id, rss_url, vehicle_name)
            VALUES (?, ?, ?, ?)
        ''', (str(interaction.guild_id), vehicle_id, rss_url, vehicle_name))
        await db.commit()
    
    await interaction.response.send_message(f"✅ Véhicule `{vehicle_name}` ajouté avec succès !", ephemeral=True)

@tree.command(name="list_vehicles", description="Lister les véhicules configurés")
async def list_vehicles(interaction: discord.Interaction):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('''
            SELECT vehicle_name, rss_url FROM vehicles 
            WHERE guild_id = ?
            ORDER BY vehicle_name
        ''', (str(interaction.guild_id),))
        vehicles = await cursor.fetchall()
    
    if not vehicles:
        await interaction.response.send_message("ℹ️ Aucun véhicule configuré. Utilisez `/add_vehicle` pour en ajouter.", ephemeral=True)
        return
    
    embed = discord.Embed(title="🚗 Véhicules configurés", color=0x3366CC)
    vehicle_list = "\n".join([f"• **{name}**\n  {url}" for name, url in vehicles[:10]])
    embed.add_field(name="Liste", value=vehicle_list or "Aucun", inline=False)
    
    if len(vehicles) > 10:
        embed.set_footer(text=f"Et {len(vehicles) - 10} autre(s) véhicule(s)")
    
    await interaction.response.send_message(embed=embed, ephemeral=True)

# ===== NOUVELLES COMMANDES =====

@tree.command(name="status", description="Voir le statut actuel d'un véhicule")
async def status(interaction: discord.Interaction, vehicle_name: str):
    try:
        vehicle_id = vehicle_name.lower().replace(" ", "_")
        
        async with aiosqlite.connect(DB_PATH) as db:
            # Vérifier que le véhicule existe et récupérer l'URL RSS
            cursor = await db.execute('''
                SELECT vehicle_name, rss_url FROM vehicles
                WHERE guild_id = ? AND vehicle_id = ?
            ''', (str(interaction.guild_id), vehicle_id))
            vehicle = await cursor.fetchone()
            
            if not vehicle:
                await interaction.response.send_message(f"❌ Le véhicule `{vehicle_name}` n'existe pas.", ephemeral=True)
                return
            
            vehicle_name_db, rss_url = vehicle
            
            # Récupérer l'état
            cursor = await db.execute('''
                SELECT last_status, last_seen_at, last_payload_hash
                FROM vehicle_states
                WHERE guild_id = ? AND vehicle_id = ?
            ''', (str(interaction.guild_id), vehicle_id))
            state = await cursor.fetchone()
            
            if not state or not state[0]:
                # Aucun statut enregistré - essayer de récupérer depuis le RSS maintenant
                print(f"⚠️ [STATUS] Aucun statut enregistré pour {vehicle_name_db} (guild: {interaction.guild_id}, vehicle_id: {vehicle_id})")
                print(f"   📡 Tentative de récupération depuis RSS: {rss_url}")
                
                try:
                    # Fetch RSS immédiatement
                    meta, content = await fetch_rss(rss_url)
                    print(f"   📥 Réponse RSS: status={meta.get('status', 'N/A')}, content_length={len(content) if content else 0}")
                    
                    if content:
                        items = parse_rss(content)
                        print(f"   📋 Items parsés: {len(items)}")
                        
                        if items:
                            latest = items[0]
                            new_status_raw = latest['status']
                            new_status = normalize_status(new_status_raw)
                            
                            print(f"   📝 Statut brut: {new_status_raw[:100]}")
                            print(f"   ✅ Statut normalisé: {new_status}")
                            
                            # Enregistrer le statut
                            now = datetime.utcnow().isoformat()
                            content_hash = generate_hash(content)
                            await db.execute('''
                                INSERT OR REPLACE INTO vehicle_states 
                                (guild_id, vehicle_id, last_status, last_seen_at, last_payload_hash, notified_available)
                                VALUES (?, ?, ?, ?, ?, 0)
                            ''', (str(interaction.guild_id), vehicle_id, new_status, now, content_hash))
                            await db.commit()
                            
                            status_text = new_status
                            last_seen = now
                            print(f"   💾 Statut enregistré: {new_status}")
                        else:
                            print(f"   ⚠️ Aucun item trouvé dans le RSS")
                            status_text = None
                            last_seen = None
                    else:
                        print(f"   ❌ Aucun contenu RSS récupéré")
                        status_text = None
                        last_seen = None
                except Exception as e:
                    print(f"   ❌ Erreur lors de la récupération RSS: {e}")
                    import traceback
                    traceback.print_exc()
                    status_text = None
                    last_seen = None
            else:
                status_text = state[0]
                last_seen = state[1]
                print(f"✅ [STATUS] Statut trouvé pour {vehicle_name_db}: {status_text} (dernière mise à jour: {last_seen})")
            
            # Si toujours pas de statut après toutes les tentatives
            if not status_text:
                embed = discord.Embed(
                    title=f"📊 Statut de {vehicle_name_db}",
                    description="Aucun statut disponible pour le moment.\nLe bot vérifie les flux RSS toutes les minutes.\n\n⚠️ Le polling n'a peut-être pas encore tourné ou le flux RSS est inaccessible.",
                    color=0x808080
                )
                embed.add_field(name="URL RSS", value=rss_url[:100] + "..." if len(rss_url) > 100 else rss_url, inline=False)
                await interaction.response.send_message(embed=embed, ephemeral=True)
                return
            
            # Emoji selon le statut
            emoji_map = {
                "Disponible": "✅",
                "Indisponible matériel": "🔧",
                "Indisponible opérationnel": "⚠️",
                "Désinfection en cours": "🧽",
                "En intervention": "🚨",
                "Retour service": "🔄",
                "Hors service": "❌"
            }
            emoji = emoji_map.get(status_text, "📊")
            
            # Gérer le timestamp de manière sécurisée
            timestamp = None
            formatted_date = None
            if last_seen:
                try:
                    timestamp = datetime.fromisoformat(last_seen)
                    # Formater la date en français
                    formatted_date = timestamp.strftime("%d/%m/%Y à %H:%M")
                except (ValueError, TypeError):
                    # Si le format de date est invalide, essayer de parser autrement
                    try:
                        timestamp = datetime.strptime(last_seen, "%Y-%m-%dT%H:%M:%S")
                        formatted_date = timestamp.strftime("%d/%m/%Y à %H:%M")
                    except:
                        formatted_date = last_seen
            
            # Créer l'embed avec les informations clairement séparées
            embed = discord.Embed(
                title=f"{emoji} Statut de {vehicle_name_db}",
                color=0x3366CC,
                timestamp=timestamp if timestamp else None
            )
            
            # Ajouter le nom du véhicule
            embed.add_field(
                name="🚗 Véhicule",
                value=vehicle_name_db,
                inline=True
            )
            
            # Ajouter le statut
            embed.add_field(
                name="📊 Statut",
                value=status_text if status_text else "Inconnu",
                inline=True
            )
            
            # Ajouter la date de mise à jour
            if formatted_date:
                embed.add_field(
                    name="🕐 Dernière mise à jour",
                    value=formatted_date,
                    inline=False
                )
            elif last_seen:
                embed.add_field(
                    name="🕐 Dernière mise à jour",
                    value=last_seen,
                    inline=False
                )
            
            # Footer avec la source
            embed.set_footer(text="Données issues du flux RSS")
            
            await interaction.response.send_message(embed=embed, ephemeral=True)
    except Exception as e:
        print(f"❌ Erreur dans la commande /status: {e}")
        import traceback
        traceback.print_exc()
        try:
            if interaction.response.is_done():
                await interaction.followup.send("❌ Une erreur s'est produite lors de la récupération du statut.", ephemeral=True)
            else:
                await interaction.response.send_message("❌ Une erreur s'est produite lors de la récupération du statut.", ephemeral=True)
        except:
            # Si même l'envoi d'erreur échoue, on log juste
            print("❌ Impossible d'envoyer le message d'erreur")

@tree.command(name="subscribe", description="S'abonner aux notifications MP d'un véhicule")
async def subscribe(interaction: discord.Interaction, vehicle_name: str):
    vehicle_id = vehicle_name.lower().replace(" ", "_")
    
    async with aiosqlite.connect(DB_PATH) as db:
        # Vérifier que le véhicule existe
        cursor = await db.execute('''
            SELECT vehicle_name FROM vehicles
            WHERE guild_id = ? AND vehicle_id = ?
        ''', (str(interaction.guild_id), vehicle_id))
        vehicle = await cursor.fetchone()
        
        if not vehicle:
            await interaction.response.send_message(f"❌ Le véhicule `{vehicle_name}` n'existe pas.", ephemeral=True)
            return
        
        # Vérifier si déjà abonné
        cursor = await db.execute('''
            SELECT user_id FROM subscriptions
            WHERE guild_id = ? AND user_id = ? AND vehicle_id = ?
        ''', (str(interaction.guild_id), str(interaction.user.id), vehicle_id))
        existing = await cursor.fetchone()
        
        if existing:
            await interaction.response.send_message(f"ℹ️ Vous êtes déjà abonné au véhicule `{vehicle[0]}`.", ephemeral=True)
            return
        
        # Ajouter l'abonnement
        await db.execute('''
            INSERT INTO subscriptions (guild_id, user_id, vehicle_id)
            VALUES (?, ?, ?)
        ''', (str(interaction.guild_id), str(interaction.user.id), vehicle_id))
        await db.commit()
    
    embed = discord.Embed(
        title="✅ Abonnement activé",
        description=f"Vous recevrez une notification MP quand **{vehicle[0]}** devient disponible.\n\n⚠️ Vous recevrez une notification **une seule fois** la prochaine fois qu'il devient disponible.",
        color=0x00AA00
    )
    await interaction.response.send_message(embed=embed, ephemeral=True)

@tree.command(name="unsubscribe", description="Se désabonner des notifications d'un véhicule")
async def unsubscribe(interaction: discord.Interaction, vehicle_name: str):
    vehicle_id = vehicle_name.lower().replace(" ", "_")
    
    async with aiosqlite.connect(DB_PATH) as db:
        # Vérifier que le véhicule existe
        cursor = await db.execute('''
            SELECT vehicle_name FROM vehicles
            WHERE guild_id = ? AND vehicle_id = ?
        ''', (str(interaction.guild_id), vehicle_id))
        vehicle = await cursor.fetchone()
        
        if not vehicle:
            await interaction.response.send_message(f"❌ Le véhicule `{vehicle_name}` n'existe pas.", ephemeral=True)
            return
        
        # Supprimer l'abonnement
        cursor = await db.execute('''
            DELETE FROM subscriptions
            WHERE guild_id = ? AND user_id = ? AND vehicle_id = ?
        ''', (str(interaction.guild_id), str(interaction.user.id), vehicle_id))
        await db.commit()
        
        if cursor.rowcount == 0:
            await interaction.response.send_message(f"ℹ️ Vous n'étiez pas abonné au véhicule `{vehicle[0]}`.", ephemeral=True)
            return
    
    embed = discord.Embed(
        title="✅ Désabonnement effectué",
        description=f"Vous ne recevrez plus de notifications pour **{vehicle[0]}**.",
        color=0x00AA00
    )
    await interaction.response.send_message(embed=embed, ephemeral=True)

@tree.command(name="my_subscriptions", description="Voir mes abonnements")
async def my_subscriptions(interaction: discord.Interaction):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('''
            SELECT v.vehicle_name
            FROM subscriptions s
            JOIN vehicles v ON s.guild_id = v.guild_id AND s.vehicle_id = v.vehicle_id
            WHERE s.guild_id = ? AND s.user_id = ?
            ORDER BY v.vehicle_name
        ''', (str(interaction.guild_id), str(interaction.user.id)))
        subscriptions = await cursor.fetchall()
    
    if not subscriptions:
        embed = discord.Embed(
            title="📋 Mes abonnements",
            description="Vous n'êtes abonné à aucun véhicule.\n\nUtilisez `/subscribe` pour vous abonner.",
            color=0x808080
        )
    else:
        embed = discord.Embed(
            title="📋 Mes abonnements",
            description=f"Vous êtes abonné à **{len(subscriptions)}** véhicule(s) :",
            color=0x3366CC
        )
        vehicle_list = "\n".join([f"• **{name}**" for (name,) in subscriptions])
        embed.add_field(name="Véhicules", value=vehicle_list, inline=False)
    
    await interaction.response.send_message(embed=embed, ephemeral=True)

# Commande de resynchronisation (admin uniquement)
@tree.command(name="resync", description="(Admin) Forcer la resynchronisation des commandes")
@app_commands.checks.has_permissions(administrator=True)
async def resync(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    try:
        print("🔄 Resynchronisation forcée des commandes...")
        synced = await tree.sync()
        names = ", ".join(sorted([c.name for c in synced])) or "(aucune)"
        await interaction.followup.send(f"✅ Commandes resynchronisées : {names}", ephemeral=True)
        print(f"✅ {len(synced)} commandes resynchronisées : {names}")
    except Exception as e:
        error_msg = f"❌ Échec de resynchronisation : {e}"
        await interaction.followup.send(error_msg, ephemeral=True)
        print(error_msg)
        import traceback
        traceback.print_exc()

# Autocomplete pour vehicle_name
@status.autocomplete("vehicle_name")
@subscribe.autocomplete("vehicle_name")
@unsubscribe.autocomplete("vehicle_name")
async def vehicle_autocomplete(interaction: discord.Interaction, current: str):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('''
            SELECT vehicle_name FROM vehicles
            WHERE guild_id = ? AND vehicle_name LIKE ?
            LIMIT 25
        ''', (str(interaction.guild_id), f"%{current}%"))
        vehicles = await cursor.fetchall()
    
    return [app_commands.Choice(name=name, value=name) for (name,) in vehicles]

if __name__ == "__main__":
    print("🔑 Vérification du token Discord...")
    token = os.getenv('DISCORD_TOKEN')
    if not token:
        print("❌ DISCORD_TOKEN manquant dans les variables d'environnement")
        print("💡 Vérifiez que DISCORD_TOKEN est défini dans votre configuration")
        exit(1)
    
    print(f"✅ Token trouvé (longueur: {len(token)} caractères)")
    print("🔌 Connexion à Discord...")
    
    try:
        client.run(token)
    except KeyboardInterrupt:
        print("\n⚠️ Arrêt demandé par l'utilisateur")
    except Exception as e:
        print(f"❌ Erreur fatale: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
