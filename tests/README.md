Run policy and source regressions with:

```sh
node --test tests/session-rules.test.cjs tests/source-regressions.test.cjs
```

Run browser regressions with Python Playwright:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory .
# In another terminal:
python3 -u tests/frontend-smoke.py
```

Set `CHROMIUM_PATH` only when you want to use a system Chromium binary. Otherwise the Playwright-managed Chromium installation is used. An optional first argument selects a different base URL, including repository subpaths such as `http://127.0.0.1:8001/WASPN/`.

GitHub Actions runs the policy, source and browser regression suites automatically on pushes to `main` and on pull requests.

Review considerations:

- The authenticated backend is authoritative for same-day `sessionClosed`, `hardStopReached`, `maxAttemptReached`, `outOfWindowEntryDetected`, attempts and realised P&L evidence. Journal/manual P&L is display/review data only and cannot originate the -$75 warning or -$100 hard stop.
- A trustworthy same-day TradeZero `dayRealized` observation is persisted to the daily record as `brokerDailyNet` with provenance/timestamp so Performance Review keeps the broker result after New York date rollover.
- Opening the UI requires a same-day, fresh, connected response with finite attempt/P&L values and all four boolean checkpoint fields. Unavailable/unauthenticated/incomplete state shows BACKEND VERIFICATION REQUIRED. Cached data never grants permission to reopen. Offline pages, journal and backups remain accessible.
- The highest observed attempts and daily stops are retained in runtime memory and the existing `waspnJournalV2` key. Attempts above five remain visible as an explicit limit breach rather than being silently clamped to 5/5.
- The loss cooldown is exactly 300,000 ms (five minutes), followed by the existing five-check reset gate. The -$75 warning marker is not a permanent session closure. Backend daily stops always take priority.
- Rejected/stale API tokens are cleared and replaced through the service-worker token protocol. A 401 retry is bounded; the frontend does not loop indefinitely with the same bad credential.
- Journal reconciliation matches exact broker source ID first, then broker attempt number, then only a unique ticker fallback. This prevents repeated same-symbol trades from attaching to the wrong manual attempt.
- Structural Compliance auto-pass requires complete/fresh broker evidence. Later objective evidence of a window breach or sixth attempt invalidates conflicting saved structural answers and recomputes the saved scores.
- Broker timing is labelled reconciled only when broker provenance is present. Legacy/manual timing fields are not presented as broker-confirmed evidence.
- Backup restore validation checks real calendar dates plus important nested numeric, trade, risk and score structures before enabling restore.
- Performance Review is year-aware at runtime. The embedded historical seed remains 2026 data, while later years are populated from saved broker/Journal records.
- The service-worker shell cache is `waspn-pwa-v9`; authentication database names, token messages, storage keys, API endpoints and backup version remain unchanged. Clearing all site data also clears the saved token, so re-authentication may be needed; until then the UI remains unverified.
- This read-only frontend cannot prevent broker orders.
