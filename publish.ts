import { publish } from "@sharkord/plugin-builder";
import manifest from "./manifest.json";

const result = await publish({
  githubToken: process.env.GITHUB_TOKEN,
  repo: "rinky-dinky/sharkord-soundboard",
  sdkVersion: manifest.sdkVersion,
});

console.log("Plugin published successfully", result.releaseUrl);
