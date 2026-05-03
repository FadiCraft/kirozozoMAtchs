const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://d.syrlive.com/matches-today/';

// استخراج رابط m3u8 المباشر من داخل كود السيرفر (iframe)
async function getDirectStream(iframeUrl) {
    if (!iframeUrl) return "";
    try {
        const { data } = await axios.get(iframeUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 7000 
        });

        // البحث عن روابط m3u8 (الرابط المباشر)
        const m3u8Regex = /https?:\/\/[^"']+\.m3u8[^"']*/g;
        const matches = data.match(m3u8Regex);

        if (matches && matches.length > 0) {
            // تنظيف الرابط من علامات الهروب لضمان عمله مباشرة
            return matches[0].replace(/\\/g, ''); 
        }
        return "";
    } catch (e) {
        return "";
    }
}

async function processMatchStream(matchUrl) {
    let result = { iframe: "", direct: "" };
    try {
        const { data } = await axios.get(matchUrl, { timeout: 8000 });
        const $ = cheerio.load(data);
        
        // استخراج رابط السيرفر
        const iframeSrc = $('iframe.cf').attr('src') || $('iframe').attr('src') || "";
        result.iframe = iframeSrc;

        if (iframeSrc) {
            // محاولة استخراج الرابط المباشر من داخل السيرفر
            result.direct = await getDirectStream(iframeSrc);
        }
    } catch (e) {
        console.log("⚠️ فشل جلب بيانات المباراة");
    }
    return result;
}

async function scrapeMatches() {
    try {
        console.log("🚀 جاري فحص المباريات واستخراج روابط البث...");
        const { data } = await axios.get(BASE_URL);
        const $ = cheerio.load(data);
        const matches = [];

        const matchElements = $('.match-container');

        for (let i = 0; i < matchElements.length; i++) {
            const el = matchElements[i];
            const detailsUrl = $(el).find('a').attr('href') || "";
            
            const match = {
                team1: $(el).find('.right-team .team-name').text().trim(),
                team1Logo: $(el).find('.right-team img').attr('src') || $(el).find('.right-team img').attr('data-src'),
                team2: $(el).find('.left-team .team-name').text().trim(),
                team2Logo: $(el).find('.left-team img').attr('src') || $(el).find('.left-team img').attr('data-src'),
                time: $(el).find('.match-time').text().trim(),
                status: $(el).find('.date').text().trim(),
                channel: $(el).find('.match-info ul li:nth-child(1) span').text().trim(),
                league: $(el).find('.match-info ul li:nth-child(3) span').text().trim(),
                streamUrl: "", // رابط السيرفر الأصلي
                stream: ""     // الرابط المباشر المستخرج (m3u8)
            };

            if (detailsUrl) {
                console.log(`🔍 فحص: ${match.team1} vs ${match.team2}`);
                const streamData = await processMatchStream(detailsUrl);
                
                match.streamUrl = streamData.iframe;
                match.stream = streamData.direct;
            }

            matches.push(match);
        }

        fs.writeFileSync('matches.json', JSON.stringify(matches, null, 2), 'utf8');
        console.log("✅ تم الحفظ بنجاح. ملف matches.json جاهز.");

    } catch (error) {
        console.error('❌ خطأ في السكربت:', error.message);
    }
}

scrapeMatches();
