# Wiki-Bot[<img src="https://translate.wikibot.de/widgets/wiki-bot/-/svg-badge.svg" alt="Translation status" align="right" />](#translations)[<img src="https://github.com/Markus-Rost/discord-wiki-bot/workflows/Node.js CI/badge.svg" alt="Node.js CI" align="right" />](https://github.com/Markus-Rost/discord-wiki-bot/actions)
[<img src="/dashboard/src/icon.png" alt="Wiki-Bot" align="right" />](https://discord.com/oauth2/authorize?client_id=461189216198590464&permissions=939904064&scope=bot%20applications.commands)

**Wiki-Bot** is a bot for [Discord](https://discord.com/) with the purpose to easily link and search [MediaWiki](https://www.mediawiki.org/wiki/MediaWiki) sites like [Gamepedia](https://www.gamepedia.com/) and [Fandom](https://www.fandom.com/) wikis. **Wiki-Bot** shows short descriptions and additional info about pages and is able to resolve redirects and follow interwiki links.

**Wiki-Bot** has translations for English, Bengali, German, French, Hindi, Dutch, Polish, Portuguese, Russian, Turkish and Chinese.

[Use this link to invite **Wiki-Bot** to your Discord server.](https://discord.com/oauth2/authorize?client_id=461189216198590464&permissions=939904064&scope=bot%20applications.commands)

[Change the server settings for **Wiki-Bot** using the dashboard.](https://settings.wikibot.de/)

Support server: [https://discord.gg/v77RTk5](https://discord.gg/v77RTk5)

#### Table of Contents
* [Setup](#setup)
* [Commands](#commands)
  * [Admin](#admin)
* [User Verification](#user-verification)
* [Recent Changes Webhook](#recent-changes-webhook)
* [Voice Channel](#voice-channel)

## Setup
After [inviting](https://discord.com/oauth2/authorize?client_id=461189216198590464&permissions=939904064&scope=bot%20applications.commands) **Wiki-Bot** to your server you need to set the wiki you want to search by default. You do this with the `!wiki settings` command.
* Change the wiki with `!wiki settings wiki <url>`
  * Example: `!wiki settings wiki https://minecraft.gamepedia.com/Minecraft_Wiki`
* Change the language with `!wiki settings lang <language>`
  * Example: `!wiki settings lang German`

## Commands
For a full list with all commands use `!wiki help`

| Command | Description |
| ------- | ----------- |
| `!wiki <search term>` | **Wiki-Bot** will answer with a link to a matching article in the wiki. |
| `!wiki !<wiki> <search term>` | **Wiki-Bot** will answer with a link to a matching article in the named Gamepedia wiki: `https://<wiki>.gamepedia.com/` |
| `!wiki ?<wiki> <search term>` | **Wiki-Bot** will answer with a link to a matching article in the named Fandom wiki: `https://<wiki>.fandom.com/` |
| `!wiki ??<wiki> <search term>` | **Wiki-Bot** will answer with a link to a matching article in the named Wikia wiki: `https://<wiki>.wikia.org/` |
| `!wiki !!<wiki> <search term>` | **Wiki-Bot** will answer with a link to a matching article in the named MediaWiki project. Example: `!wiki !!en.wikipedia.org Cookie` |
| `!wiki User:<username>` | **Wiki-Bot** will show some information about the user. |
| `!wiki diff <diff> [<oldid>]` | **Wiki-Bot** will answer with a link to the diff in the wiki. |
| `!wiki diff <page name>` | **Wiki-Bot** will answer with a link to the last diff on the article in the wiki. |
| `!wiki random` | **Wiki-Bot** will answer with a link to a random page in the wiki. |
| `!wiki overview` | **Wiki-Bot** will show some information and statistics about the wiki. |
| `!wiki discussion <search term>` | **Wiki-Bot** will answer with a link to a matching discussion thread in the Fandom wiki. |
| `!wiki discussion post <search term>` | **Wiki-Bot** will answer with a link to a matching discussion post in the Fandom wiki. |
| `!wiki info` | **Wiki-Bot** will introduce himself. |
| `!wiki help` | **Wiki-Bot** will list all the commands that he understands. |
| `!wiki help <bot command>` | **Wiki-Bot** will explain the command. |
| `!wiki help admin` | **Wiki-Bot** will list all administrator commands. |
| `!wiki test` | If **Wiki-Bot** is active, he will answer! Otherwise not. |

If you got an unwanted response, you can react with 🗑️ (`:wastebasket:`) to his message and **Wiki-Bot** will delete it.

### Admin
For a full list with all administrator commands use `!wiki help admin`

| Command | Description |
| ------- | ----------- |
| `!wiki help admin` | **Wiki-Bot** will list all administrator commands. |
| `!wiki settings` | **Wiki-Bot** will change the settings for the server. |
| `!wiki verification` | **Wiki-Bot** will change the wiki verifications used by the `!wiki verify` command. |
| `!wiki rcscript` | **Wiki-Bot** will change the recent changes webhook. |
| `!wiki voice` | **Wiki-Bot** will try to give everyone in a voice channel a specific role. |
| `!wiki pause @Wiki-Bot` | **Wiki-Bot** will ignore all commands on this server, except a few admin commands. |

Administators can also use the [dashboard](https://settings.wikibot.de/) to change the bot settings.

## User Verification
Using the `!wiki verify <wiki username>` command, users are able to verify themselves as a specific wiki user by using the Discord field on their wiki profile. If the user matches and user verifications are set up on the server, **Wiki-Bot** will give them the roles for all verification entries they matched.

Using the `!wiki verification` command, admins can add up to 10 verification entries on a server. Every verification entry allows for multiple restrictions on when a user should match the verification.
* Channel to use the `!wiki verify` command in.
* Role to get when matching the verification entry.
* Required edit count on the wiki to match the verification entry.
* Required user group to be a member of on the wiki to match the verification entry.
* Required account age in days to match the verification entry.
* Whether the Discord users nickname should be set to their wiki username when they match the verification entry.

See the [admin commands](#admin) or `!wiki help verification` on how to change the wiki verification entries on the server.

## Recent Changes Webhook
**Wiki-Bot** is able to run a recent changes webhook based on [RcGcDw](https://gitlab.com/piotrex43/RcGcDw) by using the `!wiki rcscript` command. The recent changes can be displayed in compact text messages with inline links or embed messages with edit tags and category changes.

Requirements to add a recent changes webhook:
* The wiki needs to run on [MediaWiki 1.30](https://www.mediawiki.org/wiki/MediaWiki_1.30) or higher.
* The system message `MediaWiki:Custom-RcGcDw` needs to be set to the Discord server id.

## Voice Channel
**Wiki-Bot** is able to give everyone in a voice channel a specific role. This allows for the creation of channels only visible or writable when in a specific voice channel.

Use `!wiki voice` to get the format for the role name.

## Translations
[<img src="https://translate.wikibot.de/widgets/wiki-bot/-/multi-auto.svg" alt="Translation status" width="100%" />](https://translate.wikibot.de/engage/wiki-bot/?utm_source=widget)

## Bot Lists
[![Wiki-Bot](https://bots.ondiscord.xyz/bots/461189216198590464/embed?theme=dark&showGuilds=true)](https://bots.ondiscord.xyz/bots/461189216198590464)
[![Wiki-Bot](https://botsfordiscord.com/api/bot/461189216198590464/widget?theme=dark)](https://botsfordiscord.com/bot/461189216198590464)
[![Wiki-Bot](https://discord.boats/api/widget/461189216198590464)](https://discord.boats/bot/461189216198590464)
[![Wiki-Bot](https://top.gg/api/widget/461189216198590464.svg)](https://top.gg/bot/461189216198590464)

## Other
Credits to [Encredechine](https://community.fandom.com/wiki/User:Encredechine) for the **Wiki-Bot** logo.

[Privacy Policy](PRIVACY.md#privacy-policy)
