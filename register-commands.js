import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID?.trim();

if (!token || !clientId) {
  throw new Error("DISCORD_TOKEN dan DISCORD_CLIENT_ID wajib diisi di .env");
}

const commands = [
  new SlashCommandBuilder()
    .setName("download")
    .setDescription("Download an authorized Roblox asset")
    .addStringOption(option =>
      option
        .setName("asset_id")
        .setDescription("Roblox Asset ID")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("info")
    .setDescription("Show metadata for an authorized Roblox asset")
    .addStringOption(option =>
      option
        .setName("asset_id")
        .setDescription("Roblox Asset ID")
        .setRequired(true)
    )
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

if (guildId) {
  await rest.put(
    Routes.applicationGuildCommands(clientId, guildId),
    { body: commands }
  );
  console.log(`Registered commands in guild ${guildId}`);
} else {
  await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );
  console.log("Registered global commands.");
}
