A simple Discord bot to announce when users join/exit non-AFK channels

### Configuration Commands

The following are the commands provided for bot configuration:

**Note:** All commands can be trimmed down to a minimum of two characters. For commands with similar spelling, you will have to be more specific.

* __prefix__ - Sets the prefix to use for Announcord (defaults to `ann!`).
* __announce-style__ - Sets the announcement style. The allowed styles are `join`, `exit`, and `both` (default is `both`).
  * `join` - Announces only when users joins a channel.
  * `exit` - Announces only when users exits a channel.
  * `both` - Announces when a user joins and exits a channel.
* __ignoreEmpty__ - Bot will ignore users entering an empty channel or leaving a channel empty (default is to ignore).
* __includeEmpty__ - Bot will include all non-AFK channels (empty or not) when announcing a user.
* __settings__ - Displays server's current configuration setings.
* __resestconfig__ - Resets the server's configuration to the default.
* __help__ - Displays the help information.

The hard-coded command prefix `ann$` will always be available if necessary.

### License
Copyright (c) 2018 Armando Locay  
Licensed under the MIT license.
