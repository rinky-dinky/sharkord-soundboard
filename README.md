# sharkord-soundboard

A Sharkord plugin that adds a quick-open soundboard panel and plays shared sound effects in voice channels.

## Features

- Quick-open soundboard button in the top-right plugin slot that opens a floating panel near voice controls.
- Click-to-play sounds in the user's currently active voice channel.
- Upload form for audio file + display name + emoji.
- Uploaded sounds are stored in plugin settings and available to every user.

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

## Usage

- Click the 🔊 button in the top-right bar to open the floating soundboard panel.
- The panel opens near the lower-left of the app so it is close to voice controls.
- Join a voice channel, then click a sound to play it in your active call.
