Run policy regressions with:

```sh
node tests/session-rules.test.cjs
```

Run browser regressions using installed Python Playwright and `/usr/bin/chromium`:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory .
# In another terminal:
python3 -u tests/frontend-smoke.py
```

An optional first argument selects a different base URL, including repository subpaths such as `http://127.0.0.1:8001/WASPN/`. Browser tests use isolated profiles, synthetic read-only API responses, and a synthetic token placeholder. They never need production credentials. The real service worker is exercised separately for token messages and offline caching.

Review considerations:

- The authenticated backend is authoritative for same-day `sessionClosed`, `hardStopReached`, `maxAttemptReached`, and `outOfWindowEntryDetected` checkpoints, including while live broker data is stale/disconnected. `objectiveReached` alone remains informational. The user reports backend verification (168 tests and typecheck passed); browser tests here use synthetic API responses rather than production credentials.
- Opening the UI requires a same-day, fresh, connected response with finite attempt/P&L values and all four boolean checkpoint fields. Unavailable/unauthenticated/incomplete state shows BACKEND VERIFICATION REQUIRED. Cached data never grants permission to reopen. Offline pages, journal and backups remain accessible.
- The highest observed attempts and daily stops are retained in runtime memory and the existing `waspnJournalV2` key. Clearing local storage cannot decrease known attempts. After all site data and runtime state are lost, the UI stays unverified until authenticated backend checkpoints restore the count and closures. It never invents a zero count while unverified. Cross-device recovery depends on the backend's persistent daily checkpoints.
- The loss cooldown is exactly 300,000 ms (five minutes), followed by the existing five-check reset gate. The -$75 warning marker is not a permanent session closure. Backend daily stops always take priority.
- Existing same-day `sessionEnded` records remain closed conservatively, even if an older frontend did not store the reason. No automatic migration can safely distinguish an old objective closure from a genuine daily stop.
- The service-worker shell cache moves to v8; authentication database names, token messages, request authentication, storage keys, API endpoints, and backup version remain unchanged. Clearing all site data also clears the saved token, so re-authentication may be needed; until then the UI remains unverified. This read-only frontend cannot prevent broker orders.
