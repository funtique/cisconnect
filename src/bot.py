import discord
from discord import app_commands
from discord.ext import tasks
from sqlmodel import select
from .config import settings
from .db import init_db, get_session
from .models import GuildConfig, FeedCache, Subscription, Vehicle
from .rss import fetch_rss, parse_generic, parse_monpompier
from .state import apply_states
from .notify import notify_state_change
from .util.logging import setup as setup_logging

intents = discord.Intents.default()
intents.guilds = True
client = discord.Client(intents=intents)
tree = app_commands.CommandTree(client)

@client.event
async def on_ready():
    print(f"🔗 Connecté en tant que {client.user}")
    
    # Synchronisation globale (comme le bot de test qui fonctionne)
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
    
    # Initialiser la base
    try:
        await init_db()
        print("✅ Base de données initialisée")
    except Exception as e:
        print(f"❌ Erreur DB: {e}")
        import traceback
        traceback.print_exc()
    
    # Démarrer le polling
    try:
        poll_feeds.start()
        print("✅ Polling RSS démarré")
    except Exception as e:
        print(f"❌ Erreur polling: {e}")
        import traceback
        traceback.print_exc()
    
    print(f"✅ Bot prêt !")

@tasks.loop(seconds=settings.POLL_SECONDS)
async def poll_feeds():
    async for sess in get_session():
        # Récupérer tous les véhicules configurés
        vehicles = (await sess.exec(select(Vehicle))).all()
        
        for vehicle in vehicles:
            # Récupérer la config du serveur
            cfg = (await sess.exec(select(GuildConfig).where(GuildConfig.guild_id==vehicle.guild_id))).one_or_none()
            if not cfg:
                continue
            
            # Récupérer le cache pour ce véhicule
            cache = (await sess.exec(select(FeedCache).where(FeedCache.guild_id==vehicle.guild_id, FeedCache.rss_url==vehicle.rss_url))).one_or_none()
            etag = cache.etag if cache else None
            mod = cache.last_modified if cache else None
            
            try:
                meta, content = await fetch_rss(vehicle.rss_url, etag, mod)
            except Exception:
                continue
            if content is None:
                continue
            
            # Détecter le type de parser selon l'URL
            if "monpompier.com" in vehicle.rss_url:
                items = parse_monpompier(content)
            else:
                items = parse_generic(content)
            
            # Appliquer les changements d'état pour ce véhicule spécifique
            events = await apply_states(sess, vehicle.guild_id, items, vehicle.vehicle_id)
            for ev in events:
                await notify_state_change(client, sess, ev)
            
            # Mettre à jour le cache
            if not cache:
                cache = FeedCache(guild_id=vehicle.guild_id, rss_url=vehicle.rss_url)
                sess.add(cache)
            cache.etag = meta.get('etag') or None
            cache.last_modified = meta.get('last_modified') or None
        
        await sess.commit()

# --- Commands ---

@tree.command(name="setup", description="Configurer le bot pour ce serveur")
@app_commands.checks.has_permissions(administrator=True)
async def setup(inter: discord.Interaction, channel: discord.TextChannel, role_maintenance: discord.Role, poll_seconds: int = 60):
    # Validation de l'intervalle de polling (minimum 30s, maximum 300s)
    if poll_seconds < 30 or poll_seconds > 300:
        await inter.response.send_message("❌ L'intervalle de polling doit être entre 30 et 300 secondes", ephemeral=True)
        return
    
    async for sess in get_session():
        cfg = GuildConfig(guild_id=inter.guild_id, channel_id=channel.id,
                          role_maintenance_id=role_maintenance.id,
                          poll_seconds=poll_seconds)
        await sess.merge(cfg)
        await sess.commit()
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
    await inter.response.send_message(content=note, embed=embed, ephemeral=True)

@tree.command(name="add_vehicle", description="Ajouter un véhicule à surveiller")
@app_commands.checks.has_permissions(administrator=True)
async def add_vehicle(inter: discord.Interaction, rss_url: str, vehicle_name: str):
    # Validation de l'URL RSS
    if not rss_url.startswith(('http://', 'https://')):
        await inter.response.send_message("❌ L'URL RSS doit commencer par http:// ou https://", ephemeral=True)
        return
    
    # Vérifier que la config générale existe
    async for sess in get_session():
        cfg = (await sess.exec(select(GuildConfig).where(GuildConfig.guild_id==inter.guild_id))).one_or_none()
        if not cfg:
            await inter.response.send_message("❌ Configuration générale manquante. Lancez d'abord `/setup`.", ephemeral=True)
            return
        
        # Vérifier si le véhicule existe déjà
        existing = (await sess.exec(select(Vehicle).where(Vehicle.guild_id==inter.guild_id, Vehicle.rss_url==rss_url))).one_or_none()
        if existing:
            await inter.response.send_message(f"❌ Ce flux RSS est déjà configuré pour le véhicule `{existing.vehicle_name}`.", ephemeral=True)
            return
        
        # Créer le véhicule
        vehicle = Vehicle(guild_id=inter.guild_id, rss_url=rss_url, vehicle_name=vehicle_name, vehicle_id=vehicle_name.lower().replace(" ", "_"))
        sess.add(vehicle)
        await sess.commit()
    
    await inter.response.send_message(f"✅ Véhicule `{vehicle_name}` ajouté avec succès !", ephemeral=True)

@tree.command(name="remove_vehicle", description="Supprimer un véhicule")
@app_commands.checks.has_permissions(administrator=True)
async def remove_vehicle(inter: discord.Interaction, vehicle_name: str):
    async for sess in get_session():
        vehicle = (await sess.exec(select(Vehicle).where(Vehicle.guild_id==inter.guild_id, Vehicle.vehicle_name==vehicle_name))).one_or_none()
    if not vehicle:
        await inter.response.send_message(f"❌ Véhicule `{vehicle_name}` introuvable.", ephemeral=True)
        return
    # Confirmation via boutons
    class ConfirmView(discord.ui.View):
        def __init__(self):
            super().__init__(timeout=30)
            self.value = None
        @discord.ui.button(label="Confirmer", style=discord.ButtonStyle.danger)
        async def confirm(self, interaction: discord.Interaction, button: discord.ui.Button):
            async for sess in get_session():
                await sess.exec("DELETE FROM subscription WHERE guild_id=:g AND vehicle_id=:v", params={"g": inter.guild_id, "v": vehicle.vehicle_id})
                await sess.exec("DELETE FROM feedcache WHERE guild_id=:g AND rss_url=:r", params={"g": inter.guild_id, "r": vehicle.rss_url})
                await sess.delete(vehicle)
                await sess.commit()
            await interaction.response.edit_message(content=f"✅ Véhicule `{vehicle.vehicle_name}` supprimé.", view=None)
        @discord.ui.button(label="Annuler", style=discord.ButtonStyle.secondary)
        async def cancel(self, interaction: discord.Interaction, button: discord.ui.Button):
            await interaction.response.edit_message(content="❎ Suppression annulée.", view=None)
    subs_count = 0
    async for sess in get_session():
        subs_count = (await sess.exec("SELECT COUNT(*) FROM subscription WHERE guild_id=:g AND vehicle_id=:v", params={"g": inter.guild_id, "v": vehicle.vehicle_id})).first() or 0
    await inter.response.send_message(
        content=f"❗ Confirmer la suppression de `{vehicle.vehicle_name}` ? (abonnés impactés: {subs_count})",
        view=ConfirmView(),
        ephemeral=True
    )

@remove_vehicle.autocomplete("vehicle_name")
async def autocomplete_remove_vehicle(inter: discord.Interaction, current: str):
    async for sess in get_session():
        vehicles = (await sess.exec(select(Vehicle).where(Vehicle.guild_id==inter.guild_id))).all()
    choices = []
    for v in vehicles:
        if current.lower() in v.vehicle_name.lower():
            choices.append(app_commands.Choice(name=v.vehicle_name, value=v.vehicle_name))
    return choices[:25]

@tree.command(name="list_vehicles", description="Lister les véhicules configurés")
async def list_vehicles(inter: discord.Interaction):
    async for sess in get_session():
        vehicles = (await sess.exec(select(Vehicle).where(Vehicle.guild_id==inter.guild_id))).all()
    
    if not vehicles:
        await inter.response.send_message("❌ Aucun véhicule configuré. Utilisez `/add_vehicle` pour en ajouter.", ephemeral=True)
        return
    
    embed = discord.Embed(title="🚗 Véhicules configurés", color=0x00ff00)
    for v in vehicles:
        status = "🟢" if v.last_state == "Disponible" else "🔴" if v.last_state else "⚪"
        embed.add_field(name=f"{status} {v.vehicle_name}", value=f"État: {v.last_state or 'Inconnu'}", inline=False)
    
    await inter.response.send_message(embed=embed, ephemeral=True)

@tree.command(name="subscribe", description="S'abonner aux MP d'un véhicule (devient disponible)")
async def subscribe(inter: discord.Interaction, vehicle_id: str):
    async for sess in get_session():
        sub = Subscription(guild_id=inter.guild_id, vehicle_id=vehicle_id, user_id=inter.user.id)
        # éviter doublons
        existing = (await sess.exec(select(Subscription).where(Subscription.guild_id==inter.guild_id, Subscription.vehicle_id==vehicle_id, Subscription.user_id==inter.user.id))).one_or_none()
        if existing:
            await inter.response.send_message("ℹ️ Vous êtes déjà abonné à ce véhicule.", ephemeral=True)
            return
        await sess.merge(sub)
        await sess.commit()
    await inter.response.send_message(f"📬 Abonné à `{vehicle_id}`.", ephemeral=True)

@subscribe.autocomplete("vehicle_id")
async def autocomplete_subscribe_vehicle(inter: discord.Interaction, current: str):
    async for sess in get_session():
        vehicles = (await sess.exec(select(Vehicle).where(Vehicle.guild_id==inter.guild_id))).all()
    choices = []
    for v in vehicles:
        label = f"{v.vehicle_name} ({v.vehicle_id})"
        if current.lower() in label.lower():
            choices.append(app_commands.Choice(name=label, value=v.vehicle_id))
    return choices[:25]

@tree.command(name="unsubscribe", description="Se désabonner des MP d'un véhicule")
async def unsubscribe(inter: discord.Interaction, vehicle_id: str):
    async for sess in get_session():
        await sess.exec("DELETE FROM subscription WHERE guild_id=:g AND vehicle_id=:v AND user_id=:u", params={"g": inter.guild_id, "v": vehicle_id, "u": inter.user.id})
        await sess.commit()
    await inter.response.send_message(f"🙅 Désabonné de `{vehicle_id}`.", ephemeral=True)

@unsubscribe.autocomplete("vehicle_id")
async def autocomplete_unsubscribe_vehicle(inter: discord.Interaction, current: str):
    async for sess in get_session():
        subs = (await sess.exec(select(Subscription).where(Subscription.guild_id==inter.guild_id, Subscription.user_id==inter.user.id))).all()
        vehicle_ids = [s.vehicle_id for s in subs]
        vehicles = (await sess.exec(select(Vehicle).where(Vehicle.guild_id==inter.guild_id))).all()
    by_id = {v.vehicle_id: v for v in vehicles}
    choices = []
    for vid in vehicle_ids:
        v = by_id.get(vid)
        name = v.vehicle_name if v else vid
        label = f"{name} ({vid})"
        if current.lower() in label.lower():
            choices.append(app_commands.Choice(name=label, value=vid))
    return choices[:25]

@tree.command(name="config", description="Voir la configuration")
async def config_cmd(inter: discord.Interaction):
    async for sess in get_session():
        cfg = (await sess.exec(select(GuildConfig).where(GuildConfig.guild_id==inter.guild_id))).one_or_none()
        vehicles = (await sess.exec(select(Vehicle).where(Vehicle.guild_id==inter.guild_id))).all()
    if not cfg:
        await inter.response.send_message("Aucune config. Lancez /setup.", ephemeral=True)
        return
    embed = discord.Embed(title="⚙️ Configuration du serveur", color=0x3366CC)
    embed.add_field(name="Salon", value=(f"<#{cfg.channel_id}>" if cfg.channel_id else "—"), inline=True)
    embed.add_field(name="Rôle maintenance", value=(f"<@&{cfg.role_maintenance_id}>" if cfg.role_maintenance_id else "—"), inline=True)
    embed.add_field(name="Polling", value=f"{cfg.poll_seconds}s", inline=True)
    embed.add_field(name="Véhicules", value=str(len(vehicles)), inline=True)
    # échantillon
    if vehicles:
        sample = "\n".join([f"• {v.vehicle_name} ({v.vehicle_id})" for v in vehicles[:10]])
        embed.add_field(name="Liste (max 10)", value=sample, inline=False)
    await inter.response.send_message(embed=embed, ephemeral=True)

@client.event
async def on_guild_join(guild: discord.Guild):
    try:
        await tree.sync(guild=discord.Object(id=guild.id))
    except Exception:
        pass

if __name__ == "__main__":
    setup_logging()  # logs lisibles (src/util/logging.py)
    client.run(settings.DISCORD_TOKEN)

# --- Commande annexe: mes abonnements ---
@tree.command(name="my_subscriptions", description="Lister vos abonnements aux véhicules")
async def my_subscriptions(inter: discord.Interaction):
    async for sess in get_session():
        subs = (await sess.exec(select(Subscription).where(Subscription.guild_id==inter.guild_id, Subscription.user_id==inter.user.id))).all()
        vehicles = (await sess.exec(select(Vehicle).where(Vehicle.guild_id==inter.guild_id))).all()
    by_id = {v.vehicle_id: v for v in vehicles}
    if not subs:
        await inter.response.send_message("Vous n'êtes abonné à aucun véhicule.", ephemeral=True)
        return
    embed = discord.Embed(title="📬 Mes abonnements", color=0x8888FF)
    for s in subs:
        v = by_id.get(s.vehicle_id)
        name = v.vehicle_name if v else s.vehicle_id
        embed.add_field(name=name, value=f"ID: {s.vehicle_id}", inline=False)
    await inter.response.send_message(embed=embed, ephemeral=True)

# --- Commande admin: resynchroniser les slash commands ---
@tree.command(name="resync", description="(Admin) Forcer la resynchronisation des commandes")
@app_commands.checks.has_permissions(administrator=True)
async def resync(inter: discord.Interaction):
    await inter.response.defer(ephemeral=True)
    # 1) Purger les commandes globales (anciennes) en les vidant
    try:
        tree.clear_commands(guild=None)
        await tree.sync()  # pousse la liste vide en global
    except Exception:
        pass
    # 2) Resynchroniser uniquement pour ce serveur
    try:
        guild_obj = discord.Object(id=inter.guild_id)
        tree.clear_commands(guild=guild_obj)  # nettoie le cache local pour la guilde
        # Les commandes sont déjà décorées sur le tree; sync va pousser l'état courant
        synced = await tree.sync(guild=guild_obj)
        names = ", ".join(sorted([c.name for c in synced])) or "(aucune)"
        await inter.followup.send(f"✅ Commandes resynchronisées pour ce serveur: {names}", ephemeral=True)
    except Exception as e:
        await inter.followup.send(f"❌ Échec de resynchronisation: {e}", ephemeral=True)
