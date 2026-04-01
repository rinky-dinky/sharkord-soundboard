# sharkord-soundboard

A [Sharkord](https://github.com/sharkord/sharkord) plugin that adds a soundboard panel for playing shared sound effects in voice channels.

## Features

- Quick-open soundboard button in the top-right plugin slot that opens a floating panel.
- Click-to-play sounds in the user's currently active voice channel.
- Upload audio files directly from the soundboard panel.
- Sounds are stored locally in the plugin directory and shared with all users.

## Install

1. Download the latest `sharkord-soundboard.zip` from the GitHub Releases page.
2. Unzip it into your Sharkord plugins folder.

That's it. ffmpeg is downloaded automatically on first load.

Expected layout:

```
<sharkord-plugins-folder>/
  sharkord-soundboard/
    manifest.json
    server/
      index.js
    client/
      index.js
```

## To add a sound to the soundboard

1. Join a voice channel.
2. Click the soundboard launcher button in the top-right bar to open the floating panel.
3. Click **Upload** (or the add button).
4. Enter:
   - **Sound name**
   - **Emoji**
   - **Audio file** (uploaded directly from your device)
5. Click **Add**.

## Playing sounds

1. Join a voice channel.
2. Click the soundboard launcher button in the top-right bar to open the floating panel.
3. Click any sound button to play it in your active call.

<img width="380" height="368" alt="image" src="https://github.com/user-attachments/assets/5df58d10-2009-4f78-8a0e-d90563fffeba" />

## ⚠️ Note ⚠️

This is just a vibe-coded project, use at your own risk.

Thank you [Diogo Martino](https://github.com/diogomartino) for the awesome project that is [Sharkord](https://github.com/Sharkord/sharkord)
