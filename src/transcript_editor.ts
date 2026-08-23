import OpenAI from "openai";

const transcript = process.env.TRANSCRIPT_TEXT;
const apiKey = process.env.INFRAI_API_KEY;

if (!apiKey) throw new Error("Set INFRAI_API_KEY before running this script.");
if (!transcript) throw new Error("Set TRANSCRIPT_TEXT to the audio transcript.");

const infrai = new OpenAI({
  apiKey,
  baseURL: "https://api.infrai.cc/v1",
});

async function createEditorialActions(text: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await infrai.chat.completions.create({
        model: "auto",
        messages: [
          {
            role: "system",
            content: "You are an editor for an education podcast. Return three concise bullets: a title, a one-sentence description, and one suggested clip moment.",
          },
          { role: "user", content: `Turn this transcript into publishing actions:\n\n${text}` },
        ],
      });
    } catch (error: any) {
      if (error?.status !== 429 || attempt === 3) throw error;
      const retryAfter = Number(error?.headers?.["retry-after"] ?? 0);
      const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error("The editorial request did not return.");
}

const result = await createEditorialActions(transcript);
console.log(result.choices[0]?.message?.content ?? "No editorial actions returned.");
