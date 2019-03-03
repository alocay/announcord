A simple Discord bot to announce when users join/exit non-AFK channels

### Configuration Commands

The following are the commands provided for bot configuration:

**Note:** All commands can be trimmed down to a minimum of two characters. For commands with similar spelling, you will have to be more specific.

By default, the bot is set to ignore announcing if a user enters an empty channel.  
If no channels are white/blacklisted, then all voices channels are considered avaiable for announcing.

* __prefix [prefix]__ - Sets the prefix to use for Announcord (defaults to `ann!`).
* __announce-style [style]__ - Sets the announcement style. The allowed styles are `join`, `exit`, and `both` (default is `both`).
  * `join` - Announces only when users joins a channel.
  * `exit` - Announces only when users exits a channel.
  * `both` - Announces when a user joins and exits a channel.
* __ignoreEmpty__ - Bot will ignore users entering an empty channel or leaving a channel empty (default is to ignore).
* __includeEmpty__ - Bot will include all non-AFK channels (empty or not) when announcing a user.
* __showVoices [lang/code (optional)]__ - Sends a DM containing available voices. If a language or language code is given, will filter out voices for those languages only.
* __voice [voice ID]__ - Changes the voice matching the given ID. Use the `showVoices` command for a list of available voices.
* __enterAlert [format]__ - Changes the enter alert message format. Use `%name` for the entering user's name. Max length allowed is 150 characters not including %name.
* __exitAlert [format]__ - Changes the exit alert message format. Use `%name` for the exiting user's name. Max length allowed is 150 characters not including %name.
* __blacklist [channel]__ - Puts the given channel on a blacklist. These channels will be ignored for annoucing. Can give either a channel name or ID.
* __whitelist [channel]__ - Puts the given channel on a whitelist. If the whitelist has any channel listed, only these channels will annouced in. Can give either a channel name or ID.
* __unlist [channel]__ - Removes the channel from either the blacklist or whitelist. Can give either a channel name or ID.
* __settings__ - Displays server's current configuration setings.
* __resestconfig__ - Resets the server's configuration to the default.
* __help__ - Displays the help information.

The hard-coded command prefix `ann$` will always be available if necessary.

### License
Copyright (c) 2019 Armando Locay  
Licensed under the MIT license.