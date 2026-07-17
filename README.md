# Flow — local-first AI chat, by Kongen Labs

**GPTs come and go — your conversations stay with you.**

Flow is a local-first chat app: bring your own API keys for Anthropic, OpenAI,
Google, Mistral, and DeepSeek, and chat with all of them from one place.
Your conversations live in your browser only — exportable as JSON, with no
server copy.

## Routing without a second LLM

Every Auto prompt is scored by Kongen's Logic engine and routed to the model
best suited to it. The scoring is pattern-based analysis, not another LLM
call — your prompt is never handed to a second model to decide where it
should go. And with Smart Reference, only the relevant part of your
conversation is referenced on each reply — fewer tokens sent to your
provider, and the savings follow.

**Get a free Kongen key → [kongenlabs.life](https://kongenlabs.life)**

## How it works

- **Auto mode** sends your prompt's text to Kongen's scoring API; the score
  picks the model best suited to the job. The score picks the reasoning tier;
  within a tier, Flow uses the lowest-cost model that covers it.
- **Savings come as a consequence** — trivial prompts stop hitting frontier
  pricing. Savings are estimated vs always using the latest frontier model of
  your configured providers.
- **Answers stream provider → browser.** Kongen records the routing decision
  it made (regime, confidence, chosen model), not your prompt's text.
- **No password, no profile** — your conversations are never attached to an
  account, and the app ships no analytics or tracking SDK.

Use it hosted at **[flow.kongenlabs.life](https://flow.kongenlabs.life)**.
Get a free Kongen key at **[kongenlabs.life](https://kongenlabs.life)**.

## Development

```bash
npm ci        # install
npm run dev   # dev server (Vite)
npm test      # vitest
npm run build # type-check + production build
```

## Deployment note

If you host Flow yourself, set a Content-Security-Policy whose `connect-src`
is limited to the five vendor APIs (Anthropic, OpenAI, Google, Mistral,
DeepSeek) plus `api.kongenlabs.life`.

## License

Apache-2.0 — see [LICENSE](LICENSE).

Anthropic, OpenAI, Google, Mistral, and DeepSeek names are trademarks of
their respective owners; no affiliation is implied.
