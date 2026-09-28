Object.assign(process.env, {
// Deterministic, strong-looking secrets for tests. Never used outside the test runner.
  NODE_ENV: "test",
  DATABASE_URL: "memory://test",
  APP_URL: "http://localhost:3000",
  SESSION_SECRET: "t3st-session-9f8e7d6c5b4a3928171605f4e3d2c1b0a",
  ANSWER_SECRET: "t3st-answer-0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e",
  TOKEN_SECRET: "t3st-token-a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3",
  PACKS_DIR: "tests/fixtures/packs",
});
