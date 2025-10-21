# Changelog

All notable changes to the CIS Connect Discord Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-21

### Added
- Initial release of CIS Connect Discord Bot
- Multi-server support with independent configurations per server
- RSS feed monitoring with XML parsing capabilities
- Automatic notification system (checks every 5 minutes)
- Slash commands for bot configuration:
  - `/setchannel` - Set notification channel
  - `/addfeed` - Add RSS feed to monitor
  - `/removefeed` - Remove RSS feed
  - `/listfeeds` - List all configured feeds
  - `/info` - Display help and bot information
- Per-server JSON configuration storage
- Rich embed notifications for new RSS items
- Error handling and logging
- Rate limiting to prevent Discord API abuse
- Support for RSS 2.0 and Atom feeds
- Automatic feed validation
- Documentation:
  - Comprehensive README.md
  - Quick start guide (QUICKSTART.md)
  - Architecture documentation (ARCHITECTURE.md)
- Example configuration files

### Features
- Each Discord server has isolated configuration
- Feeds checked every 5 minutes automatically
- New items posted with rich embeds including:
  - Title with link
  - Description/content snippet
  - Author (when available)
  - Publication date
  - Source feed name
- Persistent storage of last checked timestamps
- Background job scheduling
- Clean logging with emoji indicators

### Dependencies
- discord.js v14.14.1 - Discord API wrapper
- rss-parser v3.13.0 - RSS/Atom feed parser
- node-cron v3.0.3 - Task scheduler
- dotenv v16.3.1 - Environment variable loader

### Security
- Environment variables for sensitive data
- `.gitignore` configured to exclude secrets
- Input validation for RSS feed URLs

## [Unreleased]

### Planned Features
- Web dashboard for easier configuration
- Database support for larger deployments
- Custom check intervals per feed
- Feed categories and tags
- Webhook support
- Feed templates for notifications
- Priority feeds
- Multi-language support
- Notification filters (keywords, regex)
- Feed statistics and analytics
