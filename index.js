
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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song")
    .addStringOption(option =>
      option.setName("song")
        .setDescription("Song name or supported link")
        .setRequired(true)
    ),

  new SlashCommandBuilder().setName("join").setDescription("Join your voice channel"),
  new SlashCommandBuilder().setName("pause").setDescription("Pause music"),
  new SlashCommandBuilder().setName("resume").setDescription("Resume music"),
  new SlashCommandBuilder().setName("skip").setDescription("Skip current song"),
  new SlashCommandBuilder().setName("stop").setDescription("Stop music"),
  new SlashCommandBuilder().setName("queue").setDescription("Show music queue")
].map(command => command.toJSON());

const embed = (title, description, color = 0x5865F2) =>
  new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "DARK DJ • Music System" });

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

  sendToShard: (guildId, payload) =>
    client.guilds.cache.get(guildId)?.shard?.send(payload),

  autoSkip: true,

  playerOptions: {
    defaultSearchPlatform: "ytmsearch",
    onDisconnect: {
      autoReconnect: true,
      destroyPlayer: false
    },
    onEmptyQueue: {
      destroyAfterMs: 30000
    }
  },

  client: {
    id: process.env.CLIENT_ID,
    username: "DARK DJ"
  }
});

client.on("raw", data => {
  client.lavalink.sendRawData(data);
});

client.lavalink.nodeManager.on("connect", node => {
  console.log("Lavalink connected:", node.id);
});

client.lavalink.nodeManager.on("error", (node, error) => {
  console.log("Lavalink error:", error.message);
});

client.once("ready", async () => {
  console.log(`DARK DJ Online: ${client.user.tag}`);

  await client.lavalink.init({ ...client.user });

  const rest = new REST({ version: "10" })
    .setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );

  console.log("DARK DJ commands registered!");
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guild) return;

  const name = interaction.commandName;
  const member = interaction.member;
  const voice = member.voice?.channel;

  try {
    if (name === "play" || name === "join") {
      if (!voice) {
        return interaction.reply({
          embeds: [embed("❌ Voice Channel Required", "Join a voice channel first.")],
          ephemeral: true
        });
      }

      if (!client.lavalink.useable) {
        return interaction.reply({
          embeds: [embed("❌ Music Server Offline", "Lavalink node is not connected.")],
          ephemeral: true
        });
      }

      await interaction.deferReply();

      let player = client.lavalink.getPlayer(interaction.guildId);

      if (!player) {
        player = client.lavalink.createPlayer({
          guildId: interaction.guildId,
          voiceChannelId: voice.id,
          textChannelId: interaction.channelId,
          selfDeaf: true,
          volume: 100
        });
      }

      if (!player.connected) await player.connect();

      if (name === "join") {
        return interaction.editReply({
          embeds: [embed("💙 DARK DJ", `Joined ${voice.name}!`)]
        });
      }

      const query = interaction.options.getString("song");
      const result = await player.search(
        { query },
        interaction.user
      );

      if (!result.tracks?.length) {
        return interaction.editReply({
          embeds: [embed("❌ No Results", "No playable song was found.")]
        });
      }

      const tracks = result.tracks;
      player.queue.add(tracks);

      if (!player.playing) await player.play();

      return interaction.editReply({
        embeds: [
          embed(
            "🎵 Added to Queue",
            `**${tracks[0].info.title}**\nRequested by ${interaction.user}`
          )
        ]
      });
    }

    const player = client.lavalink.getPlayer(interaction.guildId);

    if (!player || !player.connected) {
      return interaction.reply({
        embeds: [embed("❌ No Music Playing", "Use `/play` first.")],
        ephemeral: true
      });
    }

    if (name === "pause") {
      await player.pause();
      return interaction.reply({
        embeds: [embed("⏸️ Music Paused", "Playback paused.")]
      });
    }

    if (name === "resume") {
      await player.resume();
      return interaction.reply({
        embeds: [embed("▶️ Music Resumed", "Playback resumed.")]
      });
    }

    if (name === "skip") {
      await player.skip();
      return interaction.reply({
        embeds: [embed("⏭️ Skipped", "Moving to the next song.")]
      });
    }

    if (name === "stop") {
      await player.stopPlaying(true);
      await player.destroy();
      return interaction.reply({
        embeds: [embed("⏹️ Music Stopped", "Queue cleared and voice channel left.")]
      });
    }

    if (name === "queue") {
      const current = player.queue.current;
      const tracks = player.queue.tracks.slice(0, 10);

      const list = tracks.length
        ? tracks.map((track, i) =>
            `**${i + 1}.** ${track.info.title}`
          ).join("\n")
        : "No upcoming songs.";

      return interaction.reply({
        embeds: [
          embed(
            "📜 DARK DJ Queue",
            `**Now Playing:** ${current?.info?.title || "Nothing"}\n\n${list}`
          )
        ]
      });
    }

  } catch (error) {
    console.error(error);

    const response = {
      embeds: [embed("❌ Error", "Something went wrong. Check bot logs.")],
      ephemeral: true
    };

    if (interaction.deferred) {
      await interaction.editReply(response);
    } else if (interaction.replied) {
      await interaction.followUp(response);
    } else {
      await interaction.reply(response);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
    
