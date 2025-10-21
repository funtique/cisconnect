const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const RSSParser = require('rss-parser');

// Load environment variables
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});

const rssParser = new RSSParser();

// Store commands
client.commands = new Collection();

// Ensure directories exist
const configDir = path.join(__dirname, 'server-configs');
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

// Load or create server configuration
function loadServerConfig(guildId) {
    const configPath = path.join(configDir, `${guildId}.json`);
    if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
    return {
        guildId,
        feeds: [],
        notificationChannel: null,
        lastChecked: {}
    };
}

// Save server configuration
function saveServerConfig(guildId, config) {
    const configPath = path.join(configDir, `${guildId}.json`);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Command: Set notification channel
const setChannelCommand = {
    name: 'setchannel',
    description: 'Set the channel for RSS feed notifications',
    options: [
        {
            name: 'channel',
            type: 7, // CHANNEL type
            description: 'The channel to send notifications to',
            required: true
        }
    ],
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const config = loadServerConfig(interaction.guildId);
        config.notificationChannel = channel.id;
        saveServerConfig(interaction.guildId, config);
        
        await interaction.reply({
            content: `✅ Notification channel set to ${channel}`,
            ephemeral: true
        });
    }
};

// Command: Add RSS feed
const addFeedCommand = {
    name: 'addfeed',
    description: 'Add an RSS feed to monitor',
    options: [
        {
            name: 'url',
            type: 3, // STRING type
            description: 'The RSS feed URL',
            required: true
        },
        {
            name: 'name',
            type: 3, // STRING type
            description: 'A friendly name for this feed',
            required: true
        }
    ],
    async execute(interaction) {
        const url = interaction.options.getString('url');
        const name = interaction.options.getString('name');
        const config = loadServerConfig(interaction.guildId);
        
        // Check if feed already exists
        if (config.feeds.some(feed => feed.url === url)) {
            await interaction.reply({
                content: '❌ This feed is already being monitored!',
                ephemeral: true
            });
            return;
        }
        
        // Validate RSS feed
        try {
            await rssParser.parseURL(url);
            config.feeds.push({ url, name, enabled: true });
            saveServerConfig(interaction.guildId, config);
            
            await interaction.reply({
                content: `✅ Added RSS feed: **${name}**\nURL: ${url}`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({
                content: `❌ Failed to add feed. Make sure the URL is a valid RSS feed.\nError: ${error.message}`,
                ephemeral: true
            });
        }
    }
};

// Command: Remove RSS feed
const removeFeedCommand = {
    name: 'removefeed',
    description: 'Remove an RSS feed',
    options: [
        {
            name: 'name',
            type: 3, // STRING type
            description: 'The name of the feed to remove',
            required: true
        }
    ],
    async execute(interaction) {
        const name = interaction.options.getString('name');
        const config = loadServerConfig(interaction.guildId);
        
        const initialLength = config.feeds.length;
        config.feeds = config.feeds.filter(feed => feed.name !== name);
        
        if (config.feeds.length === initialLength) {
            await interaction.reply({
                content: `❌ Feed "${name}" not found!`,
                ephemeral: true
            });
            return;
        }
        
        saveServerConfig(interaction.guildId, config);
        await interaction.reply({
            content: `✅ Removed RSS feed: **${name}**`,
            ephemeral: true
        });
    }
};

// Command: List RSS feeds
const listFeedsCommand = {
    name: 'listfeeds',
    description: 'List all RSS feeds being monitored',
    async execute(interaction) {
        const config = loadServerConfig(interaction.guildId);
        
        if (config.feeds.length === 0) {
            await interaction.reply({
                content: '📋 No RSS feeds configured yet. Use `/addfeed` to add one!',
                ephemeral: true
            });
            return;
        }
        
        const feedList = config.feeds.map((feed, index) => {
            const status = feed.enabled ? '🟢' : '🔴';
            return `${index + 1}. ${status} **${feed.name}**\n   URL: ${feed.url}`;
        }).join('\n\n');
        
        const channelStatus = config.notificationChannel 
            ? `<#${config.notificationChannel}>` 
            : '❌ Not set (use `/setchannel`)';
        
        await interaction.reply({
            content: `📋 **RSS Feeds**\n\nNotification Channel: ${channelStatus}\n\n${feedList}`,
            ephemeral: true
        });
    }
};

// Command: Show bot info
const infoCommand = {
    name: 'info',
    description: 'Show bot information and help',
    async execute(interaction) {
        const helpText = `
🤖 **CIS Connect Bot - RSS Feed Notifications**

**Available Commands:**
• \`/setchannel\` - Set the channel for RSS notifications
• \`/addfeed\` - Add a new RSS feed to monitor
• \`/removefeed\` - Remove an RSS feed
• \`/listfeeds\` - List all configured RSS feeds
• \`/info\` - Show this help message

**How it works:**
1. First, set a notification channel with \`/setchannel\`
2. Add RSS feeds to monitor with \`/addfeed\`
3. The bot will check feeds every 5 minutes and post new items to your notification channel

**Note:** Each server has its own independent configuration.
        `;
        
        await interaction.reply({
            content: helpText.trim(),
            ephemeral: true
        });
    }
};

// Register commands
client.commands.set(setChannelCommand.name, setChannelCommand);
client.commands.set(addFeedCommand.name, addFeedCommand);
client.commands.set(removeFeedCommand.name, removeFeedCommand);
client.commands.set(listFeedsCommand.name, listFeedsCommand);
client.commands.set(infoCommand.name, infoCommand);

// Check RSS feeds for updates
async function checkRSSFeeds() {
    console.log('🔄 Checking RSS feeds...');
    
    const guilds = client.guilds.cache;
    
    for (const [guildId, guild] of guilds) {
        const config = loadServerConfig(guildId);
        
        if (!config.notificationChannel) {
            continue;
        }
        
        const channel = guild.channels.cache.get(config.notificationChannel);
        if (!channel) {
            continue;
        }
        
        for (const feed of config.feeds) {
            if (!feed.enabled) {
                continue;
            }
            
            try {
                const feedData = await rssParser.parseURL(feed.url);
                
                // Initialize last checked time if not exists
                if (!config.lastChecked[feed.url]) {
                    config.lastChecked[feed.url] = Date.now();
                    saveServerConfig(guildId, config);
                    continue;
                }
                
                const lastChecked = config.lastChecked[feed.url];
                const newItems = feedData.items.filter(item => {
                    const pubDate = new Date(item.pubDate || item.isoDate);
                    return pubDate.getTime() > lastChecked;
                });
                
                if (newItems.length > 0) {
                    console.log(`📬 Found ${newItems.length} new items for ${feed.name} in ${guild.name}`);
                    
                    // Sort by date (oldest first)
                    newItems.sort((a, b) => {
                        const dateA = new Date(a.pubDate || a.isoDate);
                        const dateB = new Date(b.pubDate || b.isoDate);
                        return dateA - dateB;
                    });
                    
                    for (const item of newItems.slice(0, 5)) { // Limit to 5 items per check
                        const embed = {
                            color: 0x0099ff,
                            title: item.title,
                            url: item.link,
                            description: item.contentSnippet || item.content?.substring(0, 300) + '...' || 'No description available',
                            fields: [
                                {
                                    name: 'Source',
                                    value: feed.name,
                                    inline: true
                                }
                            ],
                            timestamp: item.pubDate || item.isoDate,
                            footer: {
                                text: 'RSS Feed Update'
                            }
                        };
                        
                        if (item.creator || item.author) {
                            embed.fields.push({
                                name: 'Author',
                                value: item.creator || item.author,
                                inline: true
                            });
                        }
                        
                        await channel.send({ embeds: [embed] });
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
                    }
                    
                    config.lastChecked[feed.url] = Date.now();
                    saveServerConfig(guildId, config);
                }
            } catch (error) {
                console.error(`❌ Error checking feed ${feed.name} for ${guild.name}:`, error.message);
            }
        }
    }
    
    console.log('✅ RSS feed check completed');
}

// Bot ready event
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📡 Connected to ${client.guilds.cache.size} server(s)`);
    
    // Register slash commands
    const commands = [
        setChannelCommand,
        addFeedCommand,
        removeFeedCommand,
        listFeedsCommand,
        infoCommand
    ].map(cmd => ({
        name: cmd.name,
        description: cmd.description,
        options: cmd.options || []
    }));
    
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    
    try {
        console.log('🔄 Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('✅ Slash commands registered successfully');
    } catch (error) {
        console.error('❌ Error registering slash commands:', error);
    }
    
    // Schedule RSS feed checks every 5 minutes
    cron.schedule('*/5 * * * *', () => {
        checkRSSFeeds();
    });
    
    // Initial check after 30 seconds
    setTimeout(() => {
        checkRSSFeeds();
    }, 30000);
    
    console.log('🚀 Bot is ready!');
});

// Handle interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('Error executing command:', error);
        const reply = {
            content: '❌ There was an error executing this command!',
            ephemeral: true
        };
        
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(reply);
        } else {
            await interaction.reply(reply);
        }
    }
});

// Handle guild join
client.on('guildCreate', guild => {
    console.log(`📥 Joined new server: ${guild.name} (ID: ${guild.id})`);
    // Initialize configuration for the new server
    loadServerConfig(guild.id);
});

// Handle guild leave
client.on('guildDelete', guild => {
    console.log(`📤 Left server: ${guild.name} (ID: ${guild.id})`);
});

// Error handling
client.on('error', error => {
    console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
});

// Login to Discord
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN not found in environment variables!');
    console.error('Please create a .env file with your Discord bot token.');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
