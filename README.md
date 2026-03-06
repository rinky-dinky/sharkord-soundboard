# sharkord-soundboard

A [Sharkord](https://github.com/sharkord/sharkord) plugin that adds a quick-open soundboard panel and plays shared sound effects in voice channels.

## Features

- Quick-open soundboard button in the top-right plugin slot that opens a floating panel near voice controls.
- Click-to-play sounds in the user's currently active voice channel.
- Upload form for audio file URL + display name + emoji.
- Shared sounds are persisted in plugin settings and mirrored to a public JSON URL for client sync.

## Install

1. Download the latest `sharkord-soundboard.zip` from the GitHub Releases page.
2. Unzip it into your Sharkord plugins folder.
3. Add the ffmpeg binary named `ffmpeg` into the plugin `bin/` directory.
4. From inside the `bin` directory, run `chmod +x ./ffmpeg` to make it executable.

Expected layout:

```
<sharkord-plugins-folder>/
  sharkord-soundboard/
    server.js
    client.js
    package.json
    bin/
      ffmpeg
```

If ffmpeg is missing or not executable, the plugin will fail to load.

## First-time setup (required)

The soundboard UI reads shared sounds from a public JSON mirror file.

1. Download the blank `soundboard-sounds.json` file from this plugin's GitHub release assets.
2. In Sharkord, attach `soundboard-sounds.json` to a message in any text channel, then send the message.

### Optional plugin setting

In plugin settings, `Public mirror filename` defaults to `soundboard-sounds.json`.
Keep this matching the uploaded JSON filename unless you intentionally changed it.

## To add a sound to the soundboard


1. Attach an audio file to a message in a text channel, then send the message.
2. Right-click the sent audio attachment and click **Copy link address**.
3. Open the soundboard panel.
4. Enter:
   - **Sound name**
   - **Emoji**
   - **Direct file URL** (the copied attachment link)
5. Click **Add**.
6. Reopen the panel after adding sounds if you need to refresh the shared list.

## Playing sounds

- Click the soundboard launcher button in the top-right bar (the custom speaker icon) to open the floating soundboard panel.
- Join a voice channel.
- Click any sound button to play it in your active call.
