#!/usr/bin/env python3
"""
Bot Discord simplifié qui fonctionne avec base de données SQLite
"""
import discord
from discord import app_commands
import os
import aiosqlite
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Configuration
DB_PATH = os.getenv('DB_PATH', '/data/cisconnect.db')
POLL_SECONDS = int(os.getenv('POLL_SECONDS', '60'))

intents = discord.Intents.default()
intents.guilds = True
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)

async def init_db():
    """Initialise la base de données"""
    # Créer le dossier si nécessaire
    db_dir = Path(DB_PATH).parent
    db_dir.mkdir(parents=True, exist_ok=True)
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''
            CREATE TABLE IF NOT EXISTS guild_configs (
                guild_id TEXT PRIMARY KEY,
                channel_id TEXT,
                role_maintenance_id TEXT,
                poll_seconds INTEGER DEFAULT 60
            )
        ''')
        await db.execute('''
            CREATE TABLE IF NOT EXISTS vehicles (
                guild_id TEXT,
                vehicle_id TEXT,
                rss_url TEXT,
                vehicle_name TEXT,
                PRIMARY KEY (guild_id, vehicle_id)
            )
        ''')
        await db.commit()

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
    
    print("✅ Bot prêt !")

# Commande de test
@tree.command(name="test", description="Commande de test")
async def test(interaction: discord.Interaction):
    await interaction.response.send_message("✅ Test réussi !", ephemeral=True)

# Commande setup
@tree.command(name="setup", description="Configurer le bot pour ce serveur")
@app_commands.checks.has_permissions(administrator=True)
async def setup(interaction: discord.Interaction, channel: discord.TextChannel, role_maintenance: discord.Role, poll_seconds: int = 60):
    # Validation de l'intervalle de polling
    if poll_seconds < 30 or poll_seconds > 300:
        await interaction.response.send_message("❌ L'intervalle de polling doit être entre 30 et 300 secondes", ephemeral=True)
        return
    
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute('''
            INSERT OR REPLACE INTO guild_configs (guild_id, channel_id, role_maintenance_id, poll_seconds)
            VALUES (?, ?, ?, ?)
        ''', (str(interaction.guild_id), str(channel.id), str(role_maintenance.id), poll_seconds))
        await db.commit()
    
    # Embed récapitulatif
    embed = discord.Embed(title="✅ Configuration enregistrée", color=0x00AA88)
    embed.add_field(name="Salon", value=f"<#{channel.id}>", inline=True)
    embed.add_field(name="Rôle maintenance", value=f"<@&{role_maintenance.id}>", inline=True)
    embed.add_field(name="Polling", value=f"{poll_seconds}s", inline=True)
    
    # Avertir si le rôle n'est pas mentionnable
    note = None
    try:
        if not role_maintenance.mentionable:
            note = "ℹ️ Le rôle n'est pas mentionnable. Pensez à l'autoriser si besoin."
    except Exception:
        pass
    
    await interaction.response.send_message(content=note, embed=embed, ephemeral=True)

# Commande add_vehicle
@tree.command(name="add_vehicle", description="Ajouter un véhicule à surveiller")
@app_commands.checks.has_permissions(administrator=True)
async def add_vehicle(interaction: discord.Interaction, rss_url: str, vehicle_name: str):
    # Validation de l'URL RSS
    if not rss_url.startswith(('http://', 'https://')):
        await interaction.response.send_message("❌ L'URL RSS doit commencer par http:// ou https://", ephemeral=True)
        return
    
    # Vérifier que la config générale existe
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute('SELECT guild_id FROM guild_configs WHERE guild_id = ?', (str(interaction.guild_id),))
        config = await cursor.fetchone()
        if not config:
            await interaction.response.send_message("❌ Configuration générale manquante. Lancez d'abord `/setup`.", ephemeral=True)
            return
        
        # Vérifier si le véhicule existe déjà
        vehicle_id = vehicle_name.lower().replace(" ", "_")
        cursor = await db.execute('''
            SELECT vehicle_name FROM vehicles 
            WHERE guild_id = ? AND vehicle_id = ?
        ''', (str(interaction.guild_id), vehicle_id))
        existing = await cursor.fetchone()
        if existing:
            await interaction.response.send_message(f"❌ Le véhicule `{existing[0]}` existe déjà avec cet ID.", ephemeral=True)
            return
        
        # Créer le véhicule
        await db.execute('''
            INSERT INTO vehicles (guild_id, vehicle_id, rss_url, vehicle_name)
            VALUES (?, ?, ?, ?)
        ''', (str(interaction.guild_id), vehicle_id, rss_url, vehicle_name))
        await db.commit()
    
    await interaction.response.send_message(f"✅ Véhicule `{vehicle_name}` ajouté avec succès !", ephemeral=True)

# Commande list_vehicles
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
