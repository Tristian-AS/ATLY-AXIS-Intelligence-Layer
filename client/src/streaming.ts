import type { SseEvent } from "./types.js";

/**
 * Parses a Response body as an SSE stream and yields events.
 * Works in Node 18+ and modern browsers.
 */
export async function* readSse(res: Response): AsyncGenerator<SseEvent> {
  if (!res.body) throw new Error("Response has no body to stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);

      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      try {
        const data = JSON.parse(dataLines.join("\n"));
        yield { event: eventName as SseEvent["event"], data } as SseEvent;
      } catch {
        /* skip malformed */
      }
    }
  }
}
