# Quick Start Guide

## Get Your Bot Running in 5 Minutes

### 1. Prerequisites
Make sure you have Node.js installed (version 16.9.0 or higher):
```bash
node --version
```

### 2. Clone and Install
```bash
git clone https://github.com/funtique/cisconnect.git
cd cisconnect
npm install
```

### 3. Create Your Discord Bot

1. Visit https://discord.com/developers/applications
2. Click "New Application"
3. Give it a name (e.g., "CIS Connect")
4. Go to "Bot" tab → "Add Bot"
5. **Copy your bot token** (keep it secret!)
6. Enable these intents under "Privileged Gateway Intents":
   - ✅ Server Members Intent (optional)
   - ✅ Message Content Intent (optional)

### 4. Get OAuth2 URL

1. Go to "OAuth2" → "URL Generator"
2. Select scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
3. Select bot permissions:
   - ✅ Send Messages
   - ✅ Embed Links
   - ✅ Read Message History
   - ✅ Use Slash Commands
4. **Copy the generated URL** and open it in your browser
5. Select your server and authorize the bot

### 5. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your bot token:
```env
DISCORD_TOKEN=YOUR_BOT_TOKEN_HERE
APPLICATION_ID=YOUR_APPLICATION_ID_HERE
```

### 6. Start the Bot

```bash
npm start
```

You should see:
```
✅ Logged in as YourBot#1234
📡 Connected to 1 server(s)
🔄 Registering slash commands...
✅ Slash commands registered successfully
🚀 Bot is ready!
```

### 7. Configure Your Server

In your Discord server, use these commands:

```
/info
```
Get help and see available commands.

```
/setchannel #rss-feed
```
Set the channel where RSS updates will be posted.

```
/addfeed url:https://example.com/rss name:My Feed
```
Add your first RSS feed!

```
/listfeeds
```
See all your configured feeds.

### 8. Test It

The bot will check feeds every 5 minutes. You can also:
- Add multiple feeds
- Remove feeds with `/removefeed`
- Configure different channels per server if your bot is in multiple servers

## Example RSS Feed URLs

- **BBC News**: `http://feeds.bbci.co.uk/news/rss.xml`
- **Reddit (any subreddit)**: `https://www.reddit.com/r/SUBREDDIT/.rss`
- **YouTube Channel**: `https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID`
- **Medium Blog**: `https://medium.com/feed/@username`
- **WordPress Blog**: `https://example.com/feed/`

## Troubleshooting

**Bot doesn't respond:**
- Make sure it's online (green dot)
- Check you have admin permissions
- Wait a few seconds for commands to register

**Feeds not working:**
- Verify the URL is a valid RSS/Atom feed
- Test the URL in a browser first
- Make sure you set a notification channel first

**Need help?**
Check the full README.md for detailed documentation.

## What's Next?

- Add multiple RSS feeds from different sources
- Set up the bot on multiple Discord servers (each with independent configs)
- Monitor the console logs for feed updates
- Customize the check interval in `index.js` if needed

Enjoy your automated RSS notifications! 🎉
