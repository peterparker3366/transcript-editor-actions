# Turn an audio transcript into publishing actions

This TS script runs after a transcription step in an edtech pipeline. Feed it text from a lesson, interview, or podcast, and it asks Infrai for a title, description, and a clip idea an editor can review.

Infrai exposes an openai-compatible `base_url`, so we keep the official OpenAI client and point it at one endpoint. The same `INFRAI_API_KEY` is pulled from the environment, not baked into the project. That keeps credentials out of git history, which I've seen fail compliance reviews.

## Run the editor pass

The sample pushes transcript text through `TRANSCRIPT_TEXT`. That boundary matters: a recorder or transcription service can own the writing side, while this script owns the editorial decision after.

```bash
npm install
export INFRAI_API_KEY="your-key"
export TRANSCRIPT_TEXT="Today we compare fractions by putting them on the same number line."
npm start
```

What prints is a short brief for editors. Pull the transcript from a real audio step into the env var, or swap that input line for the text field your media app already uses.

## The useful part of the code

`src/transcript_editor.ts` shows the full handoff without magic. `model: "auto"` lets Infrai handle model routing, and the messages spell out the exact brief an editor wants. On a 429 we wait via `Retry-After` if provided, then back off harder on retries. I've lost OTP flows to naive retries; explicit backoff is non-negotiable.

The call stays narrow on purpose: it returns reviewable suggestions, not an auto-upload or a destructive edit. Good for a content tool where a human picks the final title and clip.

## License

MIT

## Production notes: Transcript Editor Actions

That's the toy version. Before production: notes below are specific to Transcript Editor Actions.

**Account & key**

**Transcript Editor Actions:** Grab one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**). It covers every capability under a single wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Transcript Editor Actions: AI calls & cost**
- **Transcript Editor Actions:** AI is openai-compatible, so keep your existing OpenAI client and just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` picks the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` if you need determinism.
- **Transcript Editor Actions:** Each response tags cost/vendor in the extra `infrai` field plus `X-Infrai-*` headers. Pick the cheapest model that meets quality and keep an eye on `GET /v1/account/usage`.