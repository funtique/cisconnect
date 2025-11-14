#!/usr/bin/env python3
"""
Bot Discord pour la surveillance des véhicules via flux RSS
"""
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
    status_lower = status.lower()
    if "disponible" in status_lower and "indisponible" not in status_lower:
        return "Disponible"
    elif "indisponible" in status_lower and "matériel" in status_lower:
        return "Indisponible matériel"
    elif "indisponible" in status_lower:
        return "Indisponible opérationnel"
    elif "désinfection" in status_lower:
        return "Désinfection en cours"
    elif "intervention" in status_lower:
        return "En intervention"
    elif "retour" in status_lower:
        return "Retour service"
    elif "hors service" in status_lower:
        return "Hors service"
    return status

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

def parse_rss(content: str) -> list[dict]:
    """Parse le contenu RSS et retourne les items"""
    try:
        feed = feedparser.parse(content)
        items = []
        for entry in feed.entries[:5]:  # Prendre les 5 plus récents
            status = entry.get('title', '') or entry.get('description', '')
            items.append({
                'status': status,
                'description': entry.get('description', ''),
                'published': entry.get('published', ''),
                'link': entry.get('link', '')
            })
        return items
    except Exception as e:
        print(f"❌ Erreur parse RSS: {e}")
        return []

def generate_hash(content: str) -> str:
    """Génère un hash du contenu pour détecter les changements"""
    return hashlib.sha256(content.encode()).hexdigest()

@client.event
async def on_ready():
    print(f"🔗 Connecté en tant que {client.user}")
    
    # Initialiser la base de données
    try:
        await init_db()
        print("✅ Base de données initialisée")
    except Exception as e:
        print(f"❌ Erreur DB: {e}")
        import traceback
        traceback.print_exc()
    
    # Synchronisation globale
    try:
        print("🔄 Synchronisation globale des commandes...")
        synced = await tree.sync()
        print(f"✅ {len(synced)} commandes synchronisées globalement")
        for cmd in synced:
            print(f"  - {cmd.name}: {cmd.description}")
    except Exception as e:
        print(f"❌ Erreur sync globale: {e}")
        import traceback
        traceback.print_exc()
    
    # Démarrer le polling
    try:
        poll_feeds.start()
        print("✅ Polling RSS démarré")
    except Exception as e:
        print(f"❌ Erreur démarrage polling: {e}")
        import traceback
        traceback.print_exc()
    
    print("✅ Bot prêt !")

@tasks.loop(seconds=60)
async def poll_feeds():
    """Polling automatique des flux RSS"""
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            # Récupérer toutes les configurations
            cursor = await db.execute('SELECT guild_id, poll_seconds FROM guild_configs')
            configs = await cursor.fetchall()
            
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
                        
                        # Fetch RSS
                        meta, content = await fetch_rss(rss_url)
                        if not content:
                            continue
                        
                        # Générer le hash
                        content_hash = generate_hash(content)
                        
                        # Si le contenu n'a pas changé, skip
                        if old_hash == content_hash:
                            continue
                        
                        # Parser le RSS
                        items = parse_rss(content)
                        if not items:
                            continue
                        
                        # Prendre le premier item (le plus récent)
                        latest = items[0]
                        new_status_raw = latest['status']
                        new_status = normalize_status(new_status_raw)
                        
                        # Mettre à jour l'état
                        now = datetime.utcnow().isoformat()
                        await db.execute('''
                            INSERT OR REPLACE INTO vehicle_states 
                            (guild_id, vehicle_id, last_status, last_seen_at, last_payload_hash, notified_available)
                            VALUES (?, ?, ?, ?, ?, ?)
                        ''', (guild_id, vehicle_id, new_status, now, content_hash, notified_available))
                        
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
        
        # Récupérer l'état
        cursor = await db.execute('''
            SELECT last_status, last_seen_at
            FROM vehicle_states
            WHERE guild_id = ? AND vehicle_id = ?
        ''', (str(interaction.guild_id), vehicle_id))
        state = await cursor.fetchone()
        
        if not state or not state[0]:
            embed = discord.Embed(
                title=f"📊 Statut de {vehicle[0]}",
                description="Aucun statut disponible pour le moment.\nLe bot vérifie les flux RSS toutes les minutes.",
                color=0x808080
            )
        else:
            status_text = state[0]
            last_seen = state[1]
            
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
            
            embed = discord.Embed(
                title=f"{emoji} Statut de {vehicle[0]}",
                description=f"**Statut actuel :** {status_text}",
                color=0x3366CC,
                timestamp=datetime.fromisoformat(last_seen) if last_seen else None
            )
            if last_seen:
                embed.set_footer(text="Dernière mise à jour")
        
        await interaction.response.send_message(embed=embed, ephemeral=True)

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
    token = os.getenv('DISCORD_TOKEN')
    if not token:
        print("❌ DISCORD_TOKEN manquant")
        exit(1)
    
    try:
        client.run(token)
    except Exception as e:
        print(f"❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
