# Wiki-Bot
**Wiki-Bot** is a bot for [Discord](https://discordapp.com/) with the purpose to easily link to [Gamepedia wikis](https://gamepedia.com/).<br>**Wiki-Bot** can resolve redirects and follow interwiki links.

**Wiki-Bot is not affiliated with Curse/Gamepedia and is an unofficial tool!**

## Commands
For a full list with all commands use `!wiki help`

| Command | Description |
| --- | --- |
| `!wiki <search term>` | **Wiki-Bot** will answer with a link to a matching article in the Minecraft Wiki. |
| `!wiki page <page name>` | **Wiki-Bot** will answer with a link to the article in the Minecraft Wiki. |
| `!wiki search <search term>` | **Wiki-Bot** will answer with a link to the search page for the article in the Minecraft Wiki. |
| `!wiki User:<username>` | **Wiki-Bot** will show some information about the user. |
| `!wiki diff <diff> [<oldid>]` | **Wiki-Bot** will answer with a link to the diff in the Minecraft Wiki. |
| `!wiki info` | **Wiki-Bot** will introduce himself. |
| `!wiki help` | **Wiki-Bot** will list all the commands that he understands. |
| `!wiki !<wiki> <search term>` | **Wiki-Bot** will answer with a link to a matching article in the named Gamepedia wiki: `https://<wiki>.gamepedia.com/` |
| `!wiki test` | If **Wiki-Bot** is active, he will answer! Otherwise not. |

### Admin
For a full list with all administrator commands use `!wiki help admin`

| Command | Description |
| --- | --- |
| `!wiki help admin` | **Wiki-Bot** will list all administrator commands. |
| `!wiki settings` | **Wiki-Bot** will change the settings for the server. |
| `!wiki poll <question as free text>` | **Wiki-Bot** will create a poll and react with `:support:` and `:oppose:`. |
| `!wiki poll <emoji> [<emoji> ...] <question as free text>` | **Wiki-Bot** will create a poll and react with the possible answers. |
| `!wiki say <message>` | **Wiki-Bot** will write the given message. |
| `!wiki say alarm <message>` | **Wiki-Bot** will write the given message already preformatted: **`🚨 <message> 🚨`** |
| `!wiki delete <count>` | **Wiki-Bot** will delete the recent messages in the channel, as long as they aren't older than 14 days. |

## Voice channel
**Wiki-Bot** is able to give everyone in a voice channel a specific role. Use `!wiki voice` to get the format for the role name.
