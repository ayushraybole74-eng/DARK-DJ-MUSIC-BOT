
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder
} = require("discord.js");

const { LavalinkManager } = require("lavalink-client");

// ===============================
// ENVIRONMENT CHECK
// ===============================

const requiredEnv = [
  "DISCORD_TOKEN",
  "CLIENT_ID",
  "LAVALINK_HOST",
  "LAVALINK_PASSWORD"
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing environment variable: ${key}`);
    process.exit(1);
  }
}

const host = process.env.LAVALINK_HOST
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");

const port = Number(process.env.LAVALINK_PORT || 443);
const secure = process.env.LAVALINK_SECURE !== "false";

// ===============================
// DISCORD CLIENT
// ===============================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ===============================
// SLASH COMMANDS
// ===============================

const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a YouTube Music song")
    .addStringOption(option =>
      option.setName("song")
        .setDescription("Song name or YouTube link")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join your voice channel"),

  new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pause music"),

  new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resume music"),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skip current song"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop music and clear queue"),

  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Show music queue")
].map(command => command.toJSON());

// ===============================
// EMBED SYSTEM
// ===============================

function makeEmbed(title, description, color = 0x5865F2) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "DARK DJ • Music System" });
}

function getErrorMessage(error) {
  return error?.message || String(error);
}

// ===============================
// LAVALINK MANAGER
// ===============================

client.lavalink = new LavalinkManager({
  nodes: [
    {
      id: "DARK-DJ",
      host,
      port,
      authorization: process.env.LAVALINK_PASSWORD,
      secure,
      requestTimeout: 15000
    }
  ],

  sendToShard: (guildId, payload) =>
    client.guilds.cache.get(guildId)?.shard?.send(payload),

  autoSkip: true,

  playerOptions: {
    defaultSearchPlatform: "ytmsearch",
    clientBasedPositionUpdateInterval: 150,
    useUnresolvedData: true,

    onDisconnect: {
      autoReconnect: true,
      destroyPlayer: false
    },

    onEmptyQueue: {
      destroyAfterMs: -1
    }
  },

  queueOptions: {
    maxPreviousTracks: 25
  },

  client: {
    id: process.env.CLIENT_ID,
    username: "DARK DJ"
  }
});

// ===============================
// DISCORD RAW VOICE DATA
// ===============================

client.on("raw", data => {
  try {
    client.lavalink.sendRawData(data);
  } catch (error) {
    console.error("[VOICE RAW ERROR]", getErrorMessage(error));
  }
});

// ===============================
// LAVALINK EVENTS
// ===============================

client.lavalink.nodeManager.on("connect", node => {
  console.log("[LAVALINK CONNECTED]", node.id);
});

client.lavalink.nodeManager.on("error", (node, error) => {
  console.error(
    "[LAVALINK NODE ERROR]",
    node?.id,
    getErrorMessage(error)
  );
});

client.lavalink.on("trackStart", (player, track) => {
  console.log(
    "[TRACK START]",
    player.guildId,
    track?.info?.title
  );
});

client.lavalink.on("trackEnd", (player, track, payload) => {
  console.log(
    "[TRACK END]",
    track?.info?.title,
    payload?.reason
  );
});

client.lavalink.on("trackStuck", (player, track, payload) => {
  console.error(
    "[TRACK STUCK]",
    track?.info?.title,
    payload
  );
});

client.lavalink.on("trackError", (player, track, payload) => {
  console.error(
    "[TRACK ERROR]",
    track?.info?.title,
    payload
  );
});

client.lavalink.on("queueEnd", (player, track) => {
  console.log("[QUEUE END]", player.guildId);
});

client.lavalink.on("playerSocketClose", (player, payload) => {
  console.error(
    "[PLAYER SOCKET CLOSED]",
    player.guildId,
    payload
  );
});

// ===============================
// BOT READY
// ===============================

client.once("clientReady", async () => {
  console.log(`[DARK DJ ONLINE] ${client.user.tag}`);

  try {
    await client.lavalink.init({
      id: client.user.id,
      username: client.user.username
    });

    console.log("[LAVALINK MANAGER INITIALIZED]");

    const rest = new REST({ version: "10" })
      .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("[SLASH COMMANDS REGISTERED]");
  } catch (error) {
    console.error("[STARTUP ERROR]", error);
  }
});

// ===============================
// INTERACTION SYSTEM
// ===============================

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guild) return;

  try {
    await interaction.deferReply();

    const name = interaction.commandName;

    // Fetch actual GuildMember and voice state
    const member = await interaction.guild.members.fetch(
      interaction.user.id
    );

    const voice = member.voice.channel;

    // =============================
    // PLAY / JOIN
    // =============================

    if (name === "play" || name === "join") {
      if (!voice) {
        return interaction.editReply({
          embeds: [
            makeEmbed(
              "Voice Channel Required",
              "Join a voice channel first."
            )
          ]
        });
      }

      if (!client.lavalink.useable) {
        return interaction.editReply({
          embeds: [
            makeEmbed(
              "Music Server Offline",
              "Lavalink is not connected. Please try again later."
            )
          ]
        });
      }

      let player = client.lavalink.getPlayer(
        interaction.guildId
      );

      if (player && player.connected &&
          player.voiceChannelId !== voice.id) {
        return interaction.editReply({
          embeds: [
            makeEmbed(
              "Different Voice Channel",
              "Join the same voice channel as DARK DJ first."
            )
          ]
        });
      }

      if (!player) {
        player = client.lavalink.createPlayer({
          guildId: interaction.guildId,
          voiceChannelId: voice.id,
          textChannelId: interaction.channelId,
          selfDeaf: true,
          volume: 100
        });
      }

      if (!player.connected) {
        await player.connect();
      }

      if (name === "join") {
        return interaction.editReply({
          embeds: [
            makeEmbed(
              "DARK DJ Connected",
              `Joined **${voice.name}** successfully.`
            )
          ]
        });
      }

      // ===========================
      // YOUTUBE MUSIC SEARCH
      // ===========================

      const song = interaction.options.getString("song");

      const query = /^https?:\/\//i.test(song)
        ? song
        : `ytmsearch:${song}`;

      console.log("[SEARCH]", query);

      const result = await player.search(
        { query },
        interaction.user
      );

      if (!result || !result.tracks?.length) {
        return interaction.editReply({
          embeds: [
            makeEmbed(
              "No Results Found",
              "No playable YouTube Music result was found."
            )
          ]
        });
      }

      // Add only the first search result.
      const track = result.tracks[0];

      await player.queue.add(track);

      if (!player.playing) {
        await player.play();
      }

      const title = track.info.title || "Unknown Track";
      const uri = track.info.uri;

      const description = uri
        ? `**[${title}](${uri})**\nRequested by ${interaction.user}`
        : `**${title}**\nRequested by ${interaction.user}`;

      return interaction.editReply({
        embeds: [
          makeEmbed("Track Added to Queue", description)
        ]
      });
    }

    // =============================
    // OTHER MUSIC COMMANDS
    // =============================

    const player = client.lavalink.getPlayer(
      interaction.guildId
    );

    if (!player || !player.connected) {
      return interaction.editReply({
        embeds: [
          makeEmbed(
            "No Music Player",
            "Use `/play` first."
          )
        ]
      });
    }

    // =============================
    // PAUSE
    // =============================

    if (name === "pause") {
      if (!player.playing) {
        return interaction.editReply({
          embeds: [
            makeEmbed("Nothing Playing", "There is no active track.")
          ]
        });
      }

      await player.pause();

      return interaction.editReply({
        embeds: [
          makeEmbed("Music Paused", "Playback paused.")
        ]
      });
    }

    // =============================
    // RESUME
    // =============================

    if (name === "resume") {
      if (!player.paused) {
        return interaction.editReply({
          embeds: [
            makeEmbed("Not Paused", "Music is not paused.")
          ]
        });
      }

      await player.resume();

      return interaction.editReply({
        embeds: [
          makeEmbed("Music Resumed", "Playback resumed.")
        ]
      });
    }

    // =============================
    // SKIP
    // =============================

    if (name === "skip") {
      if (!player.queue.current) {
        return interaction.editReply({
          embeds: [
            makeEmbed("Nothing Playing", "There is no track to skip.")
          ]
        });
      }

      await player.skip();

      return interaction.editReply({
        embeds: [
          makeEmbed("Track Skipped", "Moving to the next track.")
        ]
      });
    }

    // =============================
    // STOP - CLEAR QUEUE
    // STAY IN VOICE CHANNEL
    // =============================

    if (name === "stop") {
      await player.stopPlaying(true);

      return interaction.editReply({
        embeds: [
          makeEmbed(
            "Music Stopped",
            "Playback stopped and queue cleared. DARK DJ remains in the voice channel."
          )
        ]
      });
    }

    // =============================
    // QUEUE
    // =============================

    if (name === "queue") {
      const current = player.queue.current;
      const tracks = Array.isArray(player.queue.tracks)
        ? player.queue.tracks.slice(0, 10)
        : [];

      const list = tracks.length
        ? tracks.map((track, index) =>
            `**${index + 1}.** ${track.info.title}`
          ).join("\n")
        : "No upcoming songs.";

      const currentTitle = current?.info?.title || "Nothing";

      return interaction.editReply({
        embeds: [
          makeEmbed(
            "DARK DJ Queue",
            `**Now Playing:** ${currentTitle}\n\n**Up Next:**\n${list}`
          )
        ]
      });
    }

  } catch (error) {
    console.error(
      "[COMMAND ERROR]",
      interaction.commandName,
      error
    );

    const response = {
      embeds: [
        makeEmbed(
          "Music System Error",
          "This request failed. Check the bot and Lavalink logs."
        )
      ]
    };

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(response);
      } else {
        await interaction.reply({
          ...response,
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(
        "[INTERACTION RESPONSE ERROR]",
        getErrorMessage(replyError)
      );
    }
  }
});

// ===============================
// PROCESS ERROR LOGGING
// ===============================

process.on("unhandledRejection", error => {
  console.error("[UNHANDLED REJECTION]", error);
});

client.on("error", error => {
  console.error("[DISCORD CLIENT ERROR]", error);
});

// ===============================
// LOGIN
// ===============================

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error("[DISCORD LOGIN ERROR]", error);
  process.exit(1);
});
      
