import fs from 'fs';
import path from 'path';
import toml from 'toml';

let config = null;

export function loadConfig(configPath) {
  if (config) return config;

  const content = fs.readFileSync(configPath, 'utf-8');
  config = toml.parse(content);
  return config;
}

export function getConfig() {
  if (!config) {
    throw new Error('Config not loaded');
  }
  return config;
}
