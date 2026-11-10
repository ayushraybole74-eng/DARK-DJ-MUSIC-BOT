require("dotenv").config();

const {
  Client,
  GatewayIntentBits
} = require("discord.js");

const { LavalinkManager } = require("lavalink-client");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

client.lavalink = new LavalinkManager({
  nodes: [
    {
      id: "DARK-DJ",
      host: process.env.LAVALINK_HOST,
      port: 443,
      authorization: process.env.LAVALINK_PASSWORD,
      secure: true
    }
  ],

  sendToShard: (guildId, payload) => {
    client.guilds.cache
      .get(guildId)
      ?.shard?.send(payload);
  },

  autoSkip: true,

  client: {
    id: process.env.CLIENT_ID,
    username: "DARK DJ"
  }
});

client.on("raw", (data) => {
  client.lavalink.sendRawData(data);
});

client.once("ready", async () => {
  console.log(`DARK DJ Online: ${client.user.tag}`);

  await client.lavalink.init({
    id: client.user.id,
    username: client.user.username
  });
});

client.login(process.env.DISCORD_TOKEN);
