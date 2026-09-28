import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 50 },   // Ramp up
    { duration: "1m", target: 200 },   // Normal event load
    { duration: "30s", target: 500 },  // Peak surge (e.g. countdown / first blood race)
    { duration: "1m", target: 500 },   // Hold peak load
    { duration: "30s", target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<350", "p(99)<750"], // 95% of requests under 350ms
    http_req_failed: ["rate<0.01"],                 // Less than 1% failure
  },
};

const BASE_URL = __ENV.TARGET_URL || "http://localhost:3000";

export default function runLoadTest() {
  const params = {
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "k6-load-runner/1.0",
    },
  };

  // 1. Leaderboard view (high-frequency public polling)
  const lbRes = http.get(`${BASE_URL}/api/leaderboard`, params);
  check(lbRes, {
    "leaderboard status is 200": (r) => r.status === 200,
    "leaderboard has content": (r) => r.body && r.body.length > 0,
  });

  sleep(Math.random() * 2 + 1);

  // 2. Public display pulse check
  const displayRes = http.get(`${BASE_URL}/api/display/pulse`, params);
  check(displayRes, {
    "display pulse status is 200": (r) => r.status === 200,
  });

  sleep(Math.random() * 2 + 1);

  // 3. Challenge attempt / rate-limited submission probe
  const payload = JSON.stringify({
    challengeId: "sanity",
    answer: `guess-${__VU}-${__ITER}`,
  });

  const subRes = http.post(`${BASE_URL}/api/play/submit`, payload, params);
  check(subRes, {
    "submission handled (401 unauth or 400 or 200)": (r) =>
      [200, 400, 401, 403, 429].includes(r.status),
  });

  sleep(Math.random() * 3 + 2);
}
