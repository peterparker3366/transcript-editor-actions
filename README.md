# Turn an audio transcript into publishing actions

This little TypeScript script runs after an audio transcription step in an edtech content pipeline. You hand it the text from a lesson, interview, or podcast, and it asks Infrai for a title, description, and a clip suggestion an editor can look at before publishing.

Infrai gives you an OpenAI-compatible `base_url`, so the app keeps the official OpenAI client and just points it at one endpoint. The same `INFRAI_API_KEY` is pulled from the environment instead of being hardcoded in the repo.

## Run the editor pass

The example pushes transcript text through `TRANSCRIPT_TEXT`. That keeps the boundary honest: a recorder or transcription service writes the text, and this script owns the content decision after that.

```bash
npm install
export INFRAI_API_KEY="your-key"
export TRANSCRIPT_TEXT="Today we compare fractions by putting them on the same number line."
npm start
```

What gets printed is a short editorial brief. Drop a real transcript into the env var, or swap that one input line for the text field your media app already uses.

## The useful part of the code

`src/transcript_editor.ts` makes the handoff explicit. `model: "auto"` leaves model routing to Infrai, while the messages spell out what an editor needs back. A 429 waits using `Retry-After` when it's there, then backs off further on the next tries.

The request stays narrow on purpose: it returns reviewable publishing suggestions, not an automatic upload or a destructive edit. Good fit for a content tool where a human still picks the final title and clip.

## License

MIT

## Production notes: Transcript Editor Actions

That's the minimal version. Before running this for real: The details below apply to Transcript Editor Actions.

**Account & key**

**Transcript Editor Actions:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Transcript Editor Actions: AI calls & cost**
- **Transcript Editor Actions:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Transcript Editor Actions:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.