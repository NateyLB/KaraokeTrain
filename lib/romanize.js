let kuroshiroInstance = null;

async function getKuroshiro() {
    if (!kuroshiroInstance) {
        const Kuroshiro = require('kuroshiro').default;
        const KuromojiAnalyzer = require('kuroshiro-analyzer-kuromoji');
        kuroshiroInstance = new Kuroshiro();
        await kuroshiroInstance.init(new KuromojiAnalyzer());
    }
    return kuroshiroInstance;
}

export function detectLanguage(text) {
    if (!text) return 'unknown';
    
    const hasKorean = /[\uac00-\ud7a3]/.test(text);
    const hasJapaneseKana = /[\u3040-\u309f\u30a0-\u30ff]/.test(text);
    const hasKanjiOrHanzi = /[\u4e00-\u9faf]/.test(text);

    if (hasKorean) return 'korean';
    if (hasJapaneseKana) return 'japanese';
    if (hasKanjiOrHanzi) return 'chinese';
    
    return 'unknown';
}

export async function synthesizePhonetic(lyricsObj) {
    const text = lyricsObj.syncedLyrics || lyricsObj.plainLyrics || "";
    const language = detectLanguage(text);

    if (language === 'unknown') return null;

    const romanizeLine = async (line) => {
        if (!line.trim()) return line;
        
        try {
            if (language === 'korean') {
                const { romanize } = await import('romaja');
                return romanize(line);
            } else if (language === 'japanese') {
                const k = await getKuroshiro();
                return await k.convert(line, { to: "romaji", romajiSystem: "hepburn" });
            } else if (language === 'chinese') {
                const pinyinModule = require('pinyin');
                const pyResult = pinyinModule.pinyin(line, { style: "normal" });
                return pyResult.map(arr => arr[0]).join(' ');
            }
        } catch (e) {
            console.warn(`Failed to romanize ${language} line:`, e);
            return line;
        }
    };

    const processLRC = async (lrcString) => {
        if (!lrcString) return lrcString;
        const lines = lrcString.split('\n');
        const results = [];
        for (const line of lines) {
            const timeRegex = /^(\[\d{2}:\d{2}\.\d{2,3}\]\s*)(.*)$/;
            const match = line.match(timeRegex);
            if (match) {
                const romanizedText = await romanizeLine(match[2]);
                results.push(match[1] + romanizedText);
            } else {
                results.push(await romanizeLine(line));
            }
        }
        return results.join('\n');
    };

    console.log(`Starting auto-romanization for ${language}...`);
    const t0 = Date.now();
    
    const syncedLyrics = await processLRC(lyricsObj.syncedLyrics);
    const plainLyrics = await processLRC(lyricsObj.plainLyrics);
    
    console.log(`Auto-romanization complete in ${Date.now() - t0}ms`);

    return {
        ...lyricsObj,
        id: lyricsObj.id + '_romanized',
        syncedLyrics,
        plainLyrics,
        isNative: false,
        isKorean: language === 'korean', // Keep backward compat
        label: `Romanized (from ${language})`
    };
}
