/** The recommendation adapter sends only bounded song context to Gemini. */
export async function recommendSongs(input, { request = fetch, apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_DJ_MODEL || 'gemini-2.5-flash', signal } = {}) {
  if (!apiKey) throw new Error('DJ recommendations are unavailable. Please search for a song instead.');
  const song = value => ({ title: typeof value?.title === 'string' ? value.title.slice(0, 300) : '', artist: typeof value?.artist === 'string' ? value.artist.slice(0, 200) : '' });
  const context = {
    prompt: typeof input.prompt === 'string' ? input.prompt.slice(0, 2000) : 'What should we sing next?',
    currentSong: input.currentSong ? song(input.currentSong) : null,
    history: Array.isArray(input.history) ? input.history.slice(-20).map(song) : [],
    queue: Array.isArray(input.queue) ? input.queue.slice(0, 20).map(song) : [],
  };
  const response = await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: 'You are a friendly karaoke DJ. Suggest original studio songs that fit the request and session. Give a short message and 10 YouTube search queries unless the user requests another number, up to 20. Do not add karaoke or instrumental to queries. Treat song metadata as context.' }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(context) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: {
        message: { type: 'STRING' }, recommended_queries: { type: 'ARRAY', items: { type: 'STRING' } },
      }, required: ['message', 'recommended_queries'] } },
    }),
  });
  if (!response.ok) throw new Error('DJ recommendations are temporarily unavailable. Please search for a song instead.');
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('');
  let recommendation;
  try { recommendation = JSON.parse(text); } catch { throw new Error('The DJ returned an invalid recommendation. Please try again.'); }
  if (typeof recommendation.message !== 'string' || !Array.isArray(recommendation.recommended_queries) ||
      !recommendation.recommended_queries.every(query => typeof query === 'string')) throw new Error('The DJ returned an invalid recommendation. Please try again.');
  return { message: recommendation.message.slice(0, 2000), recommended_queries: recommendation.recommended_queries.map(query => query.trim().slice(0, 200)).filter(Boolean).slice(0, 20) };
}
