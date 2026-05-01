/**
 * ============================================================================
 * F1 SIMULATION BOT — index.js
 * Optimized for: Railway & GitHub
 * Handles: Slash Commands (/) and Prefix Commands (!)
 * ============================================================================
 */

const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// 1. ENVIRONMENT VARIABLES
// These are set in your Railway "Variables" tab
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const PREFIX = '!'; 

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// 2. COMMAND REGISTRATION
client.commands = new Collection();
const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// Ensure commands directory exists
if (!fs.existsSync(commandsPath)) {
  console.log('⚠️  "commands" folder not found. Creating one...');
  fs.mkdirSync(commandsPath);
}

// Load command files from the /commands directory
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
  } else {
    console.warn(`[WARNING] The command at ${filePath} is missing "data" or "execute".`);
  }
}

// 3. SLASH COMMAND DEPLOYMENT
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log(`🚀 Refreshing ${commands.length} application (/) commands...`);
    
    // This pushes your commands to Discord's servers
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    
    console.log('✅ Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('❌ Error during command deployment:', error);
  }
})();

// 4. EVENT: INTERACTION CREATE (Slash Commands)
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing ${interaction.commandName}:`, error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
  }
});

// 5. EVENT: MESSAGE CREATE (Prefix Commands)
client.on('messageCreate', async message => {
  // Ignore bots and messages without the prefix
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName);
  if (!command) return;

  try {
    // Passing 'true' as the second argument to signal it's a prefix command
    await command.execute(message, true);
  } catch (error) {
    console.error(`Error executing prefix command ${commandName}:`, error);
    message.reply('There was an error running that command.');
  }
});

// 6. EVENT: READY
client.once('ready', () => {
  console.log(`
  ==========================================
   🏎️  F1 Bot is Online!
   🤖 Logged in as: ${client.user.tag}
   📊 Serving ${client.guilds.cache.size} servers
  ==========================================
  `);
  
  client.user.setActivity('F1 Manager | /race', { type: 0 });
});

// 7. GLOBAL ERROR HANDLING (Prevents Railway Crashes)
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(TOKEN);
