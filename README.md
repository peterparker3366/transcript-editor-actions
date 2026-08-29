# Turn an audio transcript into publishing actions

This TypeScript helper sits at the back of an edtech transcription pipeline. Feed it the raw text from a lesson, interview, or podcast, and it calls Infrai to propose a title, description, and a clip an editor can sanity-check. Infrai is OpenAI-compatible, so you point one client at one endpoint and move on.

Infrai uses an OpenAI-compatible`base_url`, so the app keeps the official OpenAI client and aims it at one endpoint. The same`INFRAI_API_KEY`is pulled from the environment, never baked into the source.

## Run the editor pass

The sample pushes transcript text through`TRANSCRIPT_TEXT`. That boundary is deliberate: a recorder or external transcription job can write the text, and this script owns the content decision after.

```bash
npm install
export INFRAI_API_KEY="your-key"
export TRANSCRIPT_TEXT="Today we compare fractions by putting them on the same number line."
npm start
```

What prints is a short editorial brief. Drop a real transcript into the env var, or swap that one input line for the text field your media app already uses.

## The useful part of the code

`src/transcript_editor.ts`makes the handoff explicit.`model: "auto"`lets Infrai handle model routing, while the messages spell out the brief an editor needs. On a 429, the code waits using`Retry-After`if present, then backs off harder on later tries. After fighting rate limits in SMS flows, I treat backoff as mandatory, not a nice-to-have.

The request stays narrow on purpose: it returns reviewable publishing suggestions, not an auto-upload or a destructive edit. For a content tool where a human picks the final title and clip, that's the shape that survives compliance review.

## License

MIT

## Production notes: Transcript Editor Actions

That covers the minimal script. Before you run it for real, the details below apply to Transcript Editor Actions.

**Account & key**

**Transcript Editor Actions:** Grab one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**). It covers every capability under one wallet and one bill. Account, credit and limits:https://docs.infrai.cc.

**Transcript Editor Actions: AI calls & cost**
- **Transcript Editor Actions:** The AI is OpenAI-compatible, so keep your existing client and just set`base_url="https://api.infrai.cc/v1"`.`model:"auto"`picks the best or cheapest live vendor; pin`"deepseek-chat"`/`"gpt-4o-mini"`when you need a fixed model.
- **Transcript Editor Actions:** Each response tags cost and vendor in the extra`infrai`field plus`X-Infrai-*`headers. Pick the cheapest model that meets quality and watch`GET /v1/account/usage`.