# CIS Connect - Multi-Server Discord RSS Bot

Repo pour le bot CIS Connect lié à MonPompier.com

A powerful Discord bot that monitors RSS feeds and sends notifications to your Discord server. Each server can configure its own RSS feeds and notification settings independently.

## Features

- 🌐 **Multi-Server Support**: Each Discord server has its own independent configuration
- 📰 **RSS Feed Monitoring**: Monitor multiple RSS feeds with XML information
- 🔔 **Automatic Notifications**: Get notified when new content is published
- ⚙️ **Slash Commands**: Easy configuration through Discord's native slash commands
- 💾 **Persistent Storage**: Server configurations are saved locally
- 🕐 **Automatic Updates**: Checks feeds every 5 minutes for new content

## Commands

| Command | Description |
|---------|-------------|
| `/setchannel <channel>` | Set the channel where RSS notifications will be sent |
| `/addfeed <url> <name>` | Add a new RSS feed to monitor |
| `/removefeed <name>` | Remove an RSS feed from monitoring |
| `/listfeeds` | Display all configured RSS feeds for this server |
| `/info` | Show bot information and help |

## Setup Instructions

### Prerequisites

- Node.js (version 16.9.0 or higher)
- A Discord bot token
- Discord Application ID

### Step 1: Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Under the bot's token, click "Copy" to copy your bot token
5. Enable these Privileged Gateway Intents:
   - Server Members Intent (optional)
   - Message Content Intent (optional)
6. Go to OAuth2 > URL Generator
7. Select scopes: `bot` and `applications.commands`
8. Select bot permissions:
   - Send Messages
   - Embed Links
   - Read Message History
   - Use Slash Commands
9. Copy the generated URL and use it to invite the bot to your server

### Step 2: Install Dependencies

```bash
npm install
```

This will install:
- `discord.js` - Discord API wrapper
- `rss-parser` - RSS feed parser with XML support
- `node-cron` - Task scheduler for periodic feed checks

### Step 3: Configure Environment Variables

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` and add your Discord bot credentials:
```env
DISCORD_TOKEN=your_discord_bot_token_here
APPLICATION_ID=your_application_id_here
```

### Step 4: Run the Bot

```bash
npm start
```

Or for development:
```bash
npm run dev
```

## Usage Guide

### Setting Up RSS Feeds

1. **Set a notification channel** (required first step):
   ```
   /setchannel #rss-notifications
   ```

2. **Add RSS feeds to monitor**:
   ```
   /addfeed url:https://example.com/feed.xml name:Example News
   ```

3. **List your configured feeds**:
   ```
   /listfeeds
   ```

4. **Remove a feed if needed**:
   ```
   /removefeed name:Example News
   ```

### How It Works

- The bot checks all configured RSS feeds every 5 minutes
- When new items are found, they are posted to the configured notification channel
- Each item includes:
  - Title (with link)
  - Description/Content snippet
  - Author (if available)
  - Publication date
  - Source feed name

### Example RSS Feeds

You can monitor any valid RSS feed, including:
- News websites
- Blog feeds
- YouTube channels (via RSS)
- Reddit subreddits
- Podcast feeds
- And many more!

## Project Structure

```
cisconnect/
├── index.js              # Main bot file
├── package.json          # Node.js dependencies
├── .env                  # Environment variables (not in git)
├── .env.example          # Example environment file
├── .gitignore           # Git ignore rules
├── README.md            # This file
└── server-configs/      # Per-server configuration files (created automatically)
    ├── 123456789.json   # Example server config
    └── 987654321.json   # Another server config
```

## Configuration File Format

Each server's configuration is stored in `server-configs/{guild_id}.json`:

```json
{
  "guildId": "123456789",
  "feeds": [
    {
      "url": "https://example.com/feed.xml",
      "name": "Example Feed",
      "enabled": true
    }
  ],
  "notificationChannel": "987654321",
  "lastChecked": {
    "https://example.com/feed.xml": 1634567890000
  }
}
```

## Troubleshooting

### Bot doesn't respond to commands
- Make sure the bot has the "Use Application Commands" permission in your server
- Check that slash commands are registered (they appear when you type `/`)
- Verify the bot is online and connected

### Feeds not updating
- Verify the RSS feed URL is valid and accessible
- Check that a notification channel is set with `/setchannel`
- Look at the console logs for error messages
- Ensure the bot has permission to send messages in the notification channel

### "Invalid RSS feed" error
- Make sure the URL points to a valid RSS/Atom feed
- Some websites require headers or authentication
- Try testing the URL in an RSS reader first

## Development

### Adding New Commands

1. Create a command object with `name`, `description`, `options`, and `execute` function
2. Register it with `client.commands.set()`
3. Add it to the commands array in the `ready` event

### Modifying Feed Check Interval

Edit the cron schedule in `index.js`:
```javascript
// Check every 5 minutes
cron.schedule('*/5 * * * *', () => {
    checkRSSFeeds();
});
```

## License

ISC

## Support

For issues related to MonPompier.com integration, please contact the CIS Connect team.
