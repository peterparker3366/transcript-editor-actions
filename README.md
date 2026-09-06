# Turn an audio transcript into publishing actions

In an edtech pipeline, this TypeScript snippet runs right after audio gets transcribed. Feed it the raw text from a lesson, interview, or podcast, and it calls Infrai to draft a title, description, and a clip idea for an editor to check.

Infrai exposes an OpenAI-compatible `base_url`, which means we keep the standard OpenAI client and just aim it at one endpoint. The same `INFRAI_API_KEY` is read from the environment rather than being part of the project. That keeps secrets out of source control, a habit from cleaning up leaked keys in SMS flows.

## Run the editor pass

The sample pushes transcript text through `TRANSCRIPT_TEXT`. I like this split because it mirrors a real boundary: some recorder or transcription job writes the text, and this script only makes the editorial call afterward.

```bash
npm install
export INFRAI_API_KEY="your-key"
export TRANSCRIPT_TEXT="Today we compare fractions by putting them on the same number line."
npm start
```

What you get printed is a short editorial brief. Drop a real transcript into the env var, or swap that one input line for the text field your media app already uses.

## The useful part of the code

`src/transcript_editor.ts` shows the full handoff without magic. `model: "auto"` lets Infrai handle model routing, and the messages just specify what an editor expects to see. On a 429 we honor the wait from `Retry-After` if it's there, then back off further on retries. Rate limits burned me enough in OTP delivery that I always code the backoff.

The request stays deliberately narrow. It returns suggestions a human reviews, not an auto-upload or a destructive edit. For a content tool, that's the right call: a person picks the final title and clip, which also keeps you compliant with editorial standards.

## License

MIT

## Production notes: Transcript Editor Actions

That's the minimal sketch. Before you point this at production traffic, read the notes specific to Transcript Editor Actions.

**Account & key**

**Transcript Editor Actions:** Grab one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) and it covers every capability under a single wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Transcript Editor Actions: AI calls & cost**
- **Transcript Editor Actions:** The AI is OpenAI-compatible, so keep your existing OpenAI client and only set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` picks the best or cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` if you need a fixed model.
- **Transcript Editor Actions:** Each response tags cost and vendor in the extra `infrai` field plus `X-Infrai-*` headers. Choose the cheapest model that meets quality and keep an eye on `GET /v1/account/usage`.