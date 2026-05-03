const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://d.syrlive.com/matches-today/';

// دالة للتأكد من أن رابط الجودة يعمل قبل وضعه
async function checkUrl(url) {
    if (!url) return "";
    try {
        const response = await axios.head(url, { timeout: 3000 });
        return response.status === 200 ? url : "";
    } catch (e) {
        return "";
    }
}

// استخراج رابط m3u8 المباشر من داخل كود السيرفر (iframe)
async function getDirectStream(iframeUrl) {
    if (!iframeUrl) return null;
    try {
        const { data } = await axios.get(iframeUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 7000 
        });

        // البحث عن روابط m3u8
        const m3u8Regex = /https?:\/\/[^"']+\.m3u8[^"']*/g;
        const matches = data.match(m3u8Regex);

        if (matches && matches.length > 0) {
            return matches[0].split('\\').join(''); // تنظيف الرابط
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function processStreamingData(matchUrl) {
    let result = {
        iframe: "", // سيوضع في streamUrl
        auto: "",
        p1080: "",
        p720: "",
        p480: "",
        p144: ""
    };

    try {
        const { data } = await axios.get(matchUrl, { timeout: 8000 });
        const $ = cheerio.load(data);
        
        // 1. استخراج رابط السيرفر الأصلي (iframe)
        result.iframe = $('iframe.cf').attr('src') || $('iframe').attr('src') || "";

        if (result.iframe) {
            // 2. استخراج الرابط المباشر من داخل السيرفر
            const directUrl = await getDirectStream(result.iframe);
            
            if (directUrl) {
                result.auto = directUrl; // الرابط المستخرج يوضع في Auto

                // 3. توليد الروابط المباشرة للجودات بناءً على النمط (Replace)
                // نفترض أن الرابط المستخرج هو الـ master أو 1080p لتوليد البقية
                let pattern = directUrl.includes('master.m3u8') ? 'master.m3u8' : 'index.m3u8';
                
                // إذا كان الرابط يحتوي على جودة معينة مثل bein3_1080p/index.m3u8
                if (directUrl.includes('_1080p')) {
                    result.p1080 = directUrl;
                    result.p720 = await checkUrl(directUrl.replace('_1080p', '_720p'));
                    result.p480 = await checkUrl(directUrl.replace('_1080p', '_480p'));
                    result.p144 = await checkUrl(directUrl.replace('_1080p', '_144p'));
                } else {
                    // محاولة بناء الروابط إذا كان الرابط الأساسي هو master.m3u8
                    const base = directUrl.split(pattern)[0];
                    result.p1080 = await checkUrl(`${base}1080p/${pattern}`);
                    result.p720 = await checkUrl(`${base}720p/${pattern}`);
                    result.p480 = await checkUrl(`${base}480p/${pattern}`);
                    result.p144 = await checkUrl(`${base}144p/${pattern}`);
                }
            }
        }
    } catch (e) {
        console.log("Error fetching details for a match");
    }
    return result;
}

async function scrapeMatches() {
    try {
        console.log("🚀 جاري استخراج البيانات وتوزيع الجودات...");
        const { data } = await axios.get(BASE_URL);
        const $ = cheerio.load(data);
        const matches = [];

        const matchElements = $('.match-container');

        for (let i = 0; i < matchElements.length; i++) {
            const el = matchElements[i];
            const detailsUrl = $(el).find('a').attr('href') || "";
            
            const match = {
                team1: $(el).find('.right-team .team-name').text().trim(),
                team1Logo: $(el).find('.right-team img').attr('src'),
                team2: $(el).find('.left-team .team-name').text().trim(),
                team2Logo: $(el).find('.left-team img').attr('src'),
                time: $(el).find('.match-time').text().trim(),
                status: $(el).find('.date').text().trim(),
                channel: $(el).find('.match-info ul li:nth-child(1) span').text().trim(),
                streamUrl: "", // سيرفر المشاهدة (iframe)
                stream_Auto: "", // الرابط المباشر (m3u8)
                stream_1080: "",
                stream_720: "",
                stream_480: "",
                stream_144: ""
            };

            if (detailsUrl) {
                console.log(`🔍 جاري معالجة: ${match.team1}...`);
                const streamData = await processStreamingData(detailsUrl);
                
                match.streamUrl = streamData.iframe;
                match.stream_Auto = streamData.auto;
                match.stream_1080 = streamData.p1080;
                match.stream_720 = streamData.p720;
                match.stream_480 = streamData.p480;
                match.stream_144 = streamData.p144;
            }

            matches.push(match);
        }

        fs.writeFileSync('matches.json', JSON.stringify(matches, null, 2), 'utf8');
        console.log("✅ تم الحفظ بنجاح في ملف matches.json");

    } catch (error) {
        console.error('❌ خطأ:', error.message);
    }
}

scrapeMatches();
