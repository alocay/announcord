import { REST, Routes } from 'discord.js';
import { clientId, guildId, token } from './src/command_config.json';
import { Commands } from "./src/botCommands";

const commands = Commands.map(c => c.data.toJSON());

// Construct and prepare an instance of the REST module
const rest = new REST({ version: '10' }).setToken(token);

// and deploy your commands!
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands },
		);

		/*const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands },
		);*/

		console.log('Successfully reloaded application (/) commands.');
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();
