const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// الرابط الجديد للموقع
const BASE_URL = 'https://www.korax90.net/matches-today';
const DOMAIN = 'https://www.korax90.net';

/**
 * دالة لاستخراج الرابط المباشر m3u8 من المشغل (السيرفر)
 */
async function getDirectStream(iframeUrl) {
    if (!iframeUrl) return "";
    
    // تصحيح الرابط إذا كان يبدأ بـ //
    const fullIframeUrl = iframeUrl.startsWith('//') ? `https:${iframeUrl}` : iframeUrl;

    try {
        const { data } = await axios.get(fullIframeUrl, { 
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': DOMAIN,
                'Origin': DOMAIN,
                'Accept': '*/*'
            },
            timeout: 10000 
        });

        // 1. البحث عن روابط m3u8 الصريحة
        const m3u8Regex = /https?[:\/\w\.-]+\.m3u8[^\s"']*/gi;
        let matches = data.match(m3u8Regex);

        if (matches && matches.length > 0) {
            return matches[0].replace(/\\/g, ''); 
        }

        // 2. البحث عن الروابط داخل سمة "source" في المشغل
        const sourceRegex = /file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i;
        const sourceMatch = data.match(sourceRegex);
        if (sourceMatch) return sourceMatch[1];

        // 3. البحث عن روابط Base64 (إذا كان المشغل يشفر الرابط)
        const base64Regex = /["']([A-Za-z0-9+/]{50,})={0,2}["']/g;
        let b64Matches;
        while ((b64Matches = base64Regex.exec(data)) !== null) {
            try {
                let decoded = Buffer.from(b64Matches[1], 'base64').toString('utf-8');
                if (decoded.includes('.m3u8')) {
                    const m = decoded.match(/https?[:\/\w\.-]+\.m3u8[^\s"']*/i);
                    if (m) return m[0];
                }
            } catch (e) {}
        }

        return "";
    } catch (e) {
        console.log(`⚠️ فشل الوصول للمشغل: ${fullIframeUrl}`);
        return "";
    }
}

/**
 * السكريبت الرئيسي لاستخراج المباريات
 */
async function scrapeMatches() {
    try {
        console.log("🚀 جاري فحص المباريات واستخراج البيانات...");
        const { data } = await axios.get(BASE_URL, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' 
            }
        });
        
        const $ = cheerio.load(data);
        const matches = [];
        
        // جلب الوقت الحالي لتخزينه في LastTime
        const currentTime = new Date().toLocaleString('ar-EG');

        // تحديد عناصر المباريات بناءً على هيكل HTML الجديد
        const matchElements = $('.match-item');

        for (let i = 0; i < matchElements.length; i++) {
            const el = matchElements[i];
            
            // استخراج زر المباراة الذي يحتوي على الرابط
            const buttonEl = $(el).find('button.match-row');
            const streamUrl = buttonEl.attr('data-frame') || "";

            // استخراج فريقي المباراة
            const teams = $(el).find('.team');
            const team1El = $(teams[0]);
            const team2El = $(teams[1]);

            // دالة مساعدة لجلب روابط الشعارات وتصحيحها إذا كانت نسبية
            const getValidLogo = (teamEl) => {
                let logoUrl = teamEl.find('img').attr('src') || "";
                if (logoUrl.startsWith('/')) logoUrl = DOMAIN + logoUrl;
                return logoUrl;
            };

            const match = {
                team1: team1El.find('.team-name').text().trim(),
                team1Logo: getValidLogo(team1El),
                team2: team2El.find('.team-name').text().trim(),
                team2Logo: getValidLogo(team2El),
                time: $(el).find('.score-time').text().trim(),
                status: $(el).find('.status-badge').text().trim(),
                channel: "غير متوفر", // القناة غير موجودة بشكل صريح في كود HTML المرفق لذلك نضعها كقيمة افتراضية
                league: $(el).find('.league').text().trim(),
                LastTime: currentTime,
                streamUrl: streamUrl, 
                stream: ""     
            };

            // إذا كان هناك رابط مشغل، نقوم بفحصه لجلب الرابط المباشر
            if (streamUrl) {
                console.log(`🔍 جاري استخراج بث: ${match.team1} vs ${match.team2}`);
                match.stream = await getDirectStream(streamUrl);
                
                if (match.stream) {
                    console.log(`✅ تم العثور على الرابط المباشر!`);
                } else {
                    console.log(`❌ لم يتم العثور على رابط مباشر (قد يكون البث لم يبدأ أو السيرفر محمي)`);
                }
            }

            matches.push(match);
        }

        // حفظ البيانات في الملف الجديد match1.json
        fs.writeFileSync('match1.json', JSON.stringify(matches, null, 2), 'utf8');
        console.log("---");
        console.log(`✅ انتهى العمل. تم حفظ ${matches.length} مباراة في match1.json وفق الهيكلية المطلوبة.`);

    } catch (error) {
        console.error('❌ خطأ في السكربت الرئيسي:', error.message);
    }
}

scrapeMatches();
