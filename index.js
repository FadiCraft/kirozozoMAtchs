const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://d.syrlive.com/matches-today/';

/**
 * استخراج رابط m3u8 المباشر من داخل كود السيرفر (iframe)
 */
async function getDirectStream(iframeUrl) {
    if (!iframeUrl) return "";
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
        return "";
    } catch (e) {
        return "";
    }
}

/**
 * فحص صفحة المباراة لجلب السيرفر والرابط المباشر
 */
async function processMatchStream(matchUrl) {
    let result = { iframe: "", direct: "" };
    try {
        const { data } = await axios.get(matchUrl, { timeout: 8000 });
        const $ = cheerio.load(data);
        
        const iframeSrc = $('iframe.cf').attr('src') || $('iframe').attr('src') || "";
        result.iframe = iframeSrc;

        if (iframeSrc) {
            result.direct = await getDirectStream(iframeSrc);
        }
    } catch (e) {
        console.log("⚠️ فشل جلب بيانات البث للمباراة");
    }
    return result;
}

/**
 * السكريبت الرئيسي لجلب المباريات
 */
async function scrapeMatches() {
    try {
        console.log("🚀 جاري فحص المباريات واستخراج البيانات...");
        const { data } = await axios.get(BASE_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);
        const matches = [];

        const matchElements = $('.match-container');

        for (let i = 0; i < matchElements.length; i++) {
            const el = matchElements[i];
            const detailsUrl = $(el).find('a').attr('href') || "";
            
            // استخراج الصور مع مراعاة الـ Lazy Loading (التحميل المتأخر)
            const getValidLogo = (sideSelector) => {
                const imgTag = $(el).find(`${sideSelector} img`);
                // الموقع يستخدم data-src للصورة الأصلية و src لصورة مؤقتة أحياناً
                let logoUrl = imgTag.attr('data-src') || imgTag.attr('src') || "";
                
                // التأكد من أن الرابط يبدأ بـ http
                if (logoUrl.startsWith('//')) {
                    logoUrl = 'https:' + logoUrl;
                }
                return logoUrl;
            };

            const match = {
                team1: $(el).find('.right-team .team-name').text().trim(),
                team1Logo: getValidLogo('.right-team'),
                team2: $(el).find('.left-team .team-name').text().trim(),
                team2Logo: getValidLogo('.left-team'),
                time: $(el).find('.match-time').text().trim(),
                status: $(el).find('.date').text().trim(),
                channel: $(el).find('.match-info ul li:nth-child(1) span').text().trim(),
                league: $(el).find('.match-info ul li:nth-child(3) span').text().trim(),
                streamUrl: "", 
                stream: ""     
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
