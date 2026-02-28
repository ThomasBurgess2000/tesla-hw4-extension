const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./test",
  timeout: 60_000,
  use: {
    headless: true
  }
});
