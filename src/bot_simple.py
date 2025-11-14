#!/usr/bin/env python3
"""
Bot Discord simplifié qui fonctionne
"""
import discord
from discord import app_commands
import os
from dotenv import load_dotenv

load_dotenv()

intents = discord.Intents.default()
intents.guilds = True
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)

@client.event
async def on_ready():
    print(f"🔗 Connecté en tant que {client.user}")
    
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
    await interaction.response.send_message("✅ Commande setup fonctionne !", ephemeral=True)

# Commande add_vehicle
@tree.command(name="add_vehicle", description="Ajouter un véhicule à surveiller")
@app_commands.checks.has_permissions(administrator=True)
async def add_vehicle(interaction: discord.Interaction, rss_url: str, vehicle_name: str):
    await interaction.response.send_message("✅ Commande add_vehicle fonctionne !", ephemeral=True)

# Commande list_vehicles
@tree.command(name="list_vehicles", description="Lister les véhicules configurés")
async def list_vehicles(interaction: discord.Interaction):
    await interaction.response.send_message("✅ Commande list_vehicles fonctionne !", ephemeral=True)

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



