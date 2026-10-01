import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  AttachmentBuilder,
  EmbedBuilder,
  Events
} from "discord.js";
import { getAssetInfo, downloadAsset, safeFileName } from "./roblox.js";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error("DISCORD_TOKEN belum diatur di .env");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function isAllowed(userId) {
  const raw = process.env.ALLOWED_USER_IDS?.trim();

  if (!raw) return true;

  const allowed = raw
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);

  return allowed.includes(userId);
}

function getDisplayName(info, assetId) {
  return (
    info?.displayName ||
    info?.name ||
    info?.asset?.displayName ||
    `Asset ${assetId}`
  );
}

client.once(Events.ClientReady, readyClient => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName !== "download" && interaction.commandName !== "info") {
    return;
  }

  if (!isAllowed(interaction.user.id)) {
    await interaction.reply({
      content: "❌ Kamu tidak memiliki izin menggunakan command ini.",
      ephemeral: true
    });
    return;
  }

  const assetId = interaction.options.getString("asset_id", true).trim();

  if (!/^\d{1,20}$/.test(assetId)) {
    await interaction.reply({
      content: "❌ Asset ID harus berupa angka Roblox.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply();

  try {
    const info = await getAssetInfo(assetId);
    const name = getDisplayName(info, assetId);

    if (interaction.commandName === "info") {
      const embed = new EmbedBuilder()
        .setTitle("Roblox Asset Info")
        .addFields(
          { name: "Asset Name", value: String(name).slice(0, 1024), inline: false },
          { name: "Asset ID", value: assetId, inline: true },
          {
            name: "Type",
            value: String(info?.assetType || info?.type || "Unknown"),
            inline: true
          }
        )
        .setFooter({ text: "Roblox Open Cloud" });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    await interaction.editReply({
      content: `⏳ Memproses **${name}** (${assetId})...`
    });

    const result = await downloadAsset(assetId);

    const extension =
      result.contentType.includes("rbxm") ? ".rbxm" :
      result.contentType.includes("rbxmx") ? ".rbxmx" :
      result.contentType.includes("zip") ? ".zip" :
      result.contentType.includes("audio") ? ".audio" :
      "";

    const fileName = `${safeFileName(name, `asset-${assetId}`)}${extension}`;

    const attachment = new AttachmentBuilder(result.buffer, {
      name: fileName
    });

    const embed = new EmbedBuilder()
      .setTitle("🎬 Roblox Asset Download Ready")
      .addFields(
        { name: "Asset Name", value: String(name).slice(0, 1024), inline: false },
        { name: "Asset ID", value: assetId, inline: true },
        {
          name: "File Size",
          value: `${(result.buffer.length / 1024).toFixed(2)} KB`,
          inline: true
        }
      )
      .setDescription(
        "File ini diambil melalui Roblox Open Cloud menggunakan kredensial yang dikonfigurasi untuk bot."
      )
      .setFooter({ text: "Gunakan hanya untuk asset yang kamu berhak akses." });

    await interaction.editReply({
      content: "",
      embeds: [embed],
      files: [attachment]
    });

  } catch (error) {
    console.error(error);

    await interaction.editReply({
      content:
        `❌ **Gagal memproses asset.**\n` +
        `\`${String(error?.message || error).slice(0, 1500)}\``
    });
  }
});

client.login(token);
