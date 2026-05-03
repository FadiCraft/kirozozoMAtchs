const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://d.syrlive.com/matches-today/';

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
            return matches[0].replace(/\\/g, ''); // تنظيف الرابط من أي علامات هروب
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function processStreamingData(matchUrl) {
    let result = {
        iframe: "", 
        auto: "",
        p1080: "",
        p720: "",
        p480: "",
        p144: ""
    };

    try {
        const { data } = await axios.get(matchUrl, { timeout: 8000 });
        const $ = cheerio.load(data);
        
        result.iframe = $('iframe.cf').attr('src') || $('iframe').attr('src') || "";

        if (result.iframe) {
            const directUrl = await getDirectStream(result.iframe);
            
            if (directUrl) {
                // وضع الرابط في Auto فوراً لضمان التشغيل
                result.auto = directUrl; 

                const qualities = ["1080p", "720p", "480p", "144p"];
                let foundQ = qualities.find(q => directUrl.includes(q));

                if (foundQ) {
                    // إذا كان الرابط المستخرج هو جودة معينة (مثلاً 1080p)
                    // نوزع الروابط المتوقعة بناءً عليه
                    result.p1080 = directUrl.replace(foundQ, "1080p");
                    result.p720  = directUrl.replace(foundQ, "720p");
                    result.p480  = directUrl.replace(foundQ, "480p");
                    result.p144  = directUrl.replace(foundQ, "144p");
                } else {
                    // إذا كان الرابط لا يحتوي على جودة (مثل master.m3u8)
                    // نحاول حقن الجودات في المسار لعلها تعمل
                    const urlParts = directUrl.split('/');
                    const fileName = urlParts.pop(); 
                    const baseDir = urlParts.join('/'); 

                    result.p1080 = `${baseDir}/1080p/${fileName}`;
                    result.p720  = `${baseDir}/720p/${fileName}`;
                    result.p480  = `${baseDir}/480p/${fileName}`;
                    result.p144  = `${baseDir}/144p/${fileName}`;
                }
            }
        }
    } catch (e) {
        console.log("Error processing match streaming data");
    }
    return result;
}

async function scrapeMatches() {
    try {
        console.log("🚀 جاري استخراج المباريات وتحديث الروابط المباشرة...");
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
                stream_Auto: "", // الرابط المستخرج أياً كان
                stream_1080: "",
                stream_720: "",
                stream_480: "",
                stream_144: ""
            };

            if (detailsUrl) {
                console.log(`🔗 جلب البيانات لـ: ${match.team1} vs ${match.team2}`);
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
        console.log("✅ تم التحديث بنجاح! تفقد ملف matches.json");

    } catch (error) {
        console.error('❌ خطأ في السكربت:', error.message);
    }
}

scrapeMatches();
