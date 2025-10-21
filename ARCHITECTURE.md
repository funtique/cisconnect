# CIS Connect Bot Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Discord Servers                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐            │
│  │  Server 1  │  │  Server 2  │  │  Server N  │            │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘            │
│        │                │                │                    │
└────────┼────────────────┼────────────────┼────────────────────┘
         │                │                │
         │    Slash Commands & Notifications
         │                │                │
         └────────────────┼────────────────┘
                          │
                ┌─────────▼──────────┐
                │   CIS Connect Bot  │
                │    (index.js)      │
                └─────────┬──────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
     ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
     │Commands │    │RSS Feed │    │ Config  │
     │ Handler │    │ Checker │    │ Manager │
     └─────────┘    └─────────┘    └────┬────┘
                          │              │
                    ┌─────▼──────┐       │
                    │ RSS Parser │       │
                    │  (XML)     │       │
                    └────────────┘       │
                                         │
                          ┌──────────────▼────────────┐
                          │  server-configs/          │
                          │  ├── 123456.json          │
                          │  ├── 789012.json          │
                          │  └── ...                  │
                          └───────────────────────────┘
```

## Component Details

### 1. Discord Bot Client
- **File**: `index.js`
- **Purpose**: Main bot instance that connects to Discord
- **Features**:
  - Multi-server support
  - Slash command registration
  - Event handling

### 2. Command Handler
- **Commands**:
  - `/setchannel` - Configure notification channel
  - `/addfeed` - Add RSS feed
  - `/removefeed` - Remove RSS feed
  - `/listfeeds` - List all feeds
  - `/info` - Show help

### 3. RSS Feed Checker
- **Interval**: Every 5 minutes (configurable)
- **Process**:
  1. Load all server configurations
  2. Check each feed for new items
  3. Compare with last checked timestamp
  4. Send new items to notification channel

### 4. Configuration Manager
- **Storage**: JSON files per server
- **Location**: `server-configs/{guild_id}.json`
- **Data Structure**:
  ```json
  {
    "guildId": "string",
    "feeds": [
      {
        "url": "string",
        "name": "string",
        "enabled": boolean
      }
    ],
    "notificationChannel": "string",
    "lastChecked": {
      "feed_url": timestamp
    }
  }
  ```

## Data Flow

### Adding a Feed
```
User types /addfeed
    ↓
Bot validates RSS feed URL
    ↓
Bot adds feed to server config
    ↓
Config saved to server-configs/{guild_id}.json
    ↓
Success message sent to user
```

### Checking Feeds (Background Job)
```
Cron job triggers every 5 minutes
    ↓
For each server in bot:
    ↓
    Load server config
    ↓
    For each feed:
        ↓
        Fetch RSS feed (XML)
        ↓
        Parse XML content
        ↓
        Filter new items (since last check)
        ↓
        Format as Discord embed
        ↓
        Send to notification channel
        ↓
        Update last checked timestamp
```

## Key Features

### Multi-Server Support
- Each Discord server has independent configuration
- Configurations stored in separate JSON files
- No cross-contamination between servers

### RSS Feed Processing
- Supports any RSS 2.0 or Atom feed
- Parses XML structure
- Extracts:
  - Title
  - Description
  - Link
  - Publication date
  - Author (if available)

### Rate Limiting
- 1-second delay between notifications
- Maximum 5 items per feed per check
- Prevents Discord API rate limits

### Error Handling
- Failed feed fetches logged but don't crash bot
- Invalid commands return error messages
- Graceful handling of missing channels

## Security Considerations

1. **Token Storage**: Bot token in `.env` file (not committed)
2. **File Permissions**: Server configs isolated per server
3. **Input Validation**: URLs validated before adding
4. **Rate Limiting**: Built-in delays prevent abuse

## Scalability

- ✅ Handles unlimited Discord servers
- ✅ Unlimited feeds per server
- ✅ Efficient cron scheduling
- ✅ Minimal memory footprint
- ⚠️ Consider database for 100+ servers

## Dependencies

- `discord.js` - Discord API wrapper
- `rss-parser` - RSS/Atom feed parser
- `node-cron` - Task scheduling
- `dotenv` - Environment variable management
