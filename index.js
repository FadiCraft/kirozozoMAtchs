const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://d.syrlive.com/matches-today/';

async function getDirectStream(iframeUrl) {
    if (!iframeUrl) return null;
    try {
        const { data } = await axios.get(iframeUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 7000 
        });

        const m3u8Regex = /https?:\/\/[^"']+\.m3u8[^"']*/g;
        const matches = data.match(m3u8Regex);

        if (matches && matches.length > 0) {
            return matches[0].replace(/\\/g, ''); 
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function processStreamingData(matchUrl) {
    let result = { iframe: "", auto: "", p1080: "", p720: "", p480: "", p144: "" };

    try {
        const { data } = await axios.get(matchUrl, { timeout: 8000 });
        const $ = cheerio.load(data);
        result.iframe = $('iframe.cf').attr('src') || $('iframe').attr('src') || "";

        if (result.iframe) {
            const directUrl = await getDirectStream(result.iframe);
            
            if (directUrl) {
                result.auto = directUrl;

                // تحليل الرابط بناءً على مثالك: https://.../ad1/index.m3u8
                const urlParts = directUrl.split('/');
                const fileName = urlParts.pop(); // index.m3u8
                const folderName = urlParts[urlParts.length - 1]; // ad1
                const baseUrl = urlParts.join('/'); // https://.../ad1

                // بناء الروابط كما في المثال: baseUrl + / + folderName + _quality + / + fileName
                // النتيجة: https://.../ad1/ad1_144p/index.m3u8
                result.p1080 = `${baseUrl}/${folderName}_1080p/${fileName}`;
                result.p720  = `${baseUrl}/${folderName}_720p/${fileName}`;
                result.p480  = `${baseUrl}/${folderName}_480p/${fileName}`;
                result.p144  = `${baseUrl}/${folderName}_144p/${fileName}`;
                
                // تنبيه: إذا كان الرابط المستخرج أصلاً يحتوي على جودة (ad1_144p)، لا نكررها
                if (directUrl.includes('_')) {
                    const cleanBase = directUrl.substring(0, directUrl.lastIndexOf('/'));
                    const rootBase = cleanBase.substring(0, cleanBase.lastIndexOf('/'));
                    const channelKey = folderName.split('_')[0];
                    
                    result.p1080 = `${rootBase}/${channelKey}_1080p/${fileName}`;
                    result.p720  = `${rootBase}/${channelKey}_720p/${fileName}`;
                    result.p480  = `${rootBase}/${channelKey}_480p/${fileName}`;
                    result.p144  = `${rootBase}/${channelKey}_144p/${fileName}`;
                }
            }
        }
    } catch (e) {
        console.log("Error in path construction");
    }
    return result;
}

async function scrapeMatches() {
    try {
        console.log("🚀 جاري الاستخراج بالنمط الصحيح...");
        const { data } = await axios.get(BASE_URL);
        const $ = cheerio.load(data);
        const matches = [];

        $('.match-container').each((i, el) => {
            matches.push({
                team1: $(el).find('.right-team .team-name').text().trim(),
                team1Logo: $(el).find('.right-team img').attr('src') || $(el).find('.right-team img').attr('data-src'),
                team2: $(el).find('.left-team .team-name').text().trim(),
                team2Logo: $(el).find('.left-team img').attr('src') || $(el).find('.left-team img').attr('data-src'),
                time: $(el).find('.match-time').text().trim(),
                status: $(el).find('.date').text().trim(),
                channel: $(el).find('.match-info ul li:nth-child(1) span').text().trim(),
                detailsUrl: $(el).find('a').attr('href') || "",
                streamUrl: "",
                stream_Auto: "",
                stream_1080: "",
                stream_720: "",
                stream_480: "",
                stream_144: ""
            });
        });

        for (let match of matches) {
            if (match.detailsUrl) {
                console.log(`📡 جلب: ${match.team1}`);
                const streamData = await processStreamingData(match.detailsUrl);
                match.streamUrl = streamData.iframe;
                match.stream_Auto = streamData.auto;
                match.stream_1080 = streamData.p1080;
                match.stream_720 = streamData.p720;
                match.stream_480 = streamData.p480;
                match.stream_144 = streamData.p144;
            }
        }

        fs.writeFileSync('matches.json', JSON.stringify(matches, null, 2), 'utf8');
        console.log("✅ تم الحفظ بالروابط الصحيحة.");
    } catch (error) {
        console.error('❌ خطأ:', error.message);
    }
}

scrapeMatches();
