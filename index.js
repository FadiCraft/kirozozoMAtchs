const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

// إعدادات مخصصة لطلب البيانات وتجنب الحظر
const AXIOS_CONFIG = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*'
    },
    timeout: 10000
};

/**
 * دالة ذكية وموحدة لاستخراج رابط الـ m3u8 من محتوى الصفحة أو الـ iframe
 */
async function extractM3u8(htmlContent) {
    if (!htmlContent) return "";

    // 1. البحث عن الروابط الصريحة
    const m3u8Regex = /https?[:\/\w\.-]+\.m3u8[^\s"']*/gi;
    let matches = htmlContent.match(m3u8Regex);
    if (matches && matches.length > 0) {
        return matches[0].replace(/\\/g, ''); 
    }

    // 2. البحث داخل سمة "file" أو "source" في المشغلات الشهيرة
    const sourceRegex = /(?:file|source|src)\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i;
    const sourceMatch = htmlContent.match(sourceRegex);
    if (sourceMatch) return sourceMatch[1].replace(/\\/g, '');

    // 3. فك تشفير روابط Base64 إن وجدت
    const base64Regex = /["']([A-Za-z0-9+/]{50,})={0,2}["']/g;
    let b64Matches;
    while ((b64Matches = base64Regex.exec(htmlContent)) !== null) {
        try {
            let decoded = Buffer.from(b64Matches[1], 'base64').toString('utf-8');
            if (decoded.includes('.m3u8')) {
                const innerMatch = decoded.match(/https?[:\/\w\.-]+\.m3u8[^\s"']*/i);
                if (innerMatch) return innerMatch[0];
            }
        } catch (e) {}
    }

    return "";
}

/**
 * دالة موحدة لفحص الـ iframe والوصول للرابط المباشر
 */
async function getDirectStream(iframeUrl, refererUrl = '') {
    if (!iframeUrl) return "";
    const fullIframeUrl = iframeUrl.startsWith('//') ? `https:${iframeUrl}` : iframeUrl;

    try {
        const config = { ...AXIOS_CONFIG };
        if (refererUrl) {
            config.headers['Referer'] = refererUrl;
            config.headers['Origin'] = new URL(refererUrl).origin;
        }

        const { data } = await axios.get(fullIframeUrl, config);
        return await extractM3u8(data);
    } catch (e) {
        console.log(`⚠️ فشل فحص المشغل: ${fullIframeUrl}`);
        return "";
    }
}

/**
 * دالة للتحقق من أن رابط الـ m3u8 يعمل بالفعل ومستقر (يعيد كود 200)
 */
async function verifyStreamUrl(url) {
    if (!url) return false;
    try {
        const response = await axios.head(url, { timeout: 5000 });
        return response.status === 200;
    } catch (e) {
        try {
            // بعض السيرفرات ترفض طلب HEAD، نجرّب GET سريع بصفر بايت
            const response = await axios.get(url, { timeout: 5000, headers: { Range: 'bytes=0-0' } });
            return response.status === 200 || response.status === 206;
        } catch (err) {
            return false;
        }
    }
}

// ==========================================
// قسم كاشطات المواقع (Scrapers)
// ==========================================

/**
 * كاشط موقع Yalla Sports
 */
async function scrapeYallaSports() {
    const baseUrl = 'https://www.yalla-sports12.com/';
    const matches = [];
    try {
        const { data } = await axios.get(baseUrl, AXIOS_CONFIG);
        const $ = cheerio.load(data);
        
        // تعديل الـ selectors بناءً على هيكلية الموقع الفعلية
        const matchElements = $('.match-container, .match-box, .ego-match'); 

        for (let i = 0; i < matchElements.length; i++) {
            const el = matchElements[i];
            const detailsUrl = $(el).find('a').attr('href') || "";
            
            const getValidLogo = (selector) => {
                const img = $(el).find(selector);
                let src = img.attr('data-src') || img.attr('src') || "";
                if (src.startsWith('//')) src = 'https:' + src;
                return src;
            };

            const match = {
                team1: $(el).find('.right-team .team-name, .home-team').text().trim(),
                team1Logo: getValidLogo('.right-team img, .home-logo'),
                team2: $(el).find('.left-team .team-name, .away-team').text().trim(),
                team2Logo: getValidLogo('.left-team img, .away-logo'),
                time: $(el).find('.match-time, .time').text().trim(),
                status: $(el).find('.date, .match-status').text().trim(),
                channel: $(el).find('.channel, .match-info li:nth-child(1)').text().trim() || "غير معروف",
                league: $(el).find('.league, .match-info li:nth-child(3)').text().trim() || "بطولة مجهولة",
                source: "YallaSports",
                detailsUrl: detailsUrl
            };

            if (match.team1 && match.team2) {
                matches.push(match);
            }
        }
    } catch (e) {
        console.error(`❌ خطأ أثناء كشط YallaSports:`, e.message);
    }
    return matches;
}

/**
 * كاشط موقع Koora Live (كمثال لإضافة موقع ثاني)
 */
async function scrapeKooraLive() {
    const baseUrl = 'https://koora-live.com/'; // أو النطاق النشط حالياً
    const matches = [];
    try {
        const { data } = await axios.get(baseUrl, AXIOS_CONFIG);
        const $ = cheerio.load(data);
        
        // الـ selectors الافتراضية لقوالب البث المباشر الشائعة (مثل بلوجر الرياضي)
        $('.match-card, .match_container').each((i, el) => {
            const detailsUrl = $(el).find('a').attr('href') || "";
            
            const match = {
                team1: $(el).find('.team-home .name, .left-team .team-name').text().trim(),
                team1Logo: $(el).find('.team-home img').attr('src') || "",
                team2: $(el).find('.team-away .name, .right-team .team-name').text().trim(),
                team2Logo: $(el).find('.team-away img').attr('src') || "",
                time: $(el).find('.match-time').text().trim(),
                status: $(el).find('.match-status, .live-center').text().trim(),
                channel: $(el).find('.match-channel').text().trim() || "بين سبورت",
                league: $(el).find('.match-league').text().trim() || "الدوري",
                source: "KooraLive",
                detailsUrl: detailsUrl
            };

            if (match.team1 && match.team2) matches.push(match);
        });
    } catch (e) {
        console.log(`⚠️ لم نتمكن من جلب موقع KooraLive (قد يكون النطاق تغير أو محمي)`);
    }
    return matches;
}

// ==========================================
// المحرك الرئيسي المعالج والمفلتر للبيانات
// ==========================================

async function main() {
    console.log("🚀 بدء عملية جمع المباريات من مصادر متعددة...");
    
    // 1. جمع البيانات الأولية من كافة المواقع المتوفرة
    const allRawMatches = [
        ...(await scrapeYallaSports()),
        ...(await scrapeKooraLive())
    ];

    console.log(`📊 تم جمع ${allRawMatches.length} مباراة أولية. جاري الفلترة واستخراج البث المباشر المعزز...`);

    const finalMatches = [];
    const processedPairs = new Set(); // لتفادي تكرار نفس المباراة من موقعين مختلفين

    for (const rawMatch of allRawMatches) {
        // فلترة وتوحيد المعرفات الفرعية لتجنب التكرار (تنظيف الأسماء لضمان مطابقتها)
        const matchKey = `${rawMatch.team1.toLowerCase()}_vs_${rawMatch.team2.toLowerCase()}`;
        if (processedPairs.has(matchKey)) {
            console.log(`⏭️ تخطي التكرار للمباراة: ${rawMatch.team1} ضد ${rawMatch.team2}`);
            continue; 
        }

        let streamUrl = "";
        let directStream = "";

        // 2. الدخول لصفحة تفاصيل المباراة لاستخراج البث إن وجد
        if (rawMatch.detailsUrl) {
            try {
                console.log(`🔍 جاري معالجة بث: ${rawMatch.team1} vs ${rawMatch.team2} (${rawMatch.source})`);
                const { data } = await axios.get(rawMatch.detailsUrl, { ...AXIOS_CONFIG, headers: { 'Referer': rawMatch.detailsUrl } });
                const $ = cheerio.load(data);
                
                // البحث عن الـ iframe
                const iframeSrc = $('iframe').attr('src') || $('iframe.cf').attr('src') || "";
                streamUrl = iframeSrc;

                if (iframeSrc) {
                    directStream = await getDirectStream(iframeSrc, rawMatch.detailsUrl);
                } else {
                    // إذا كان الرابط مدمج مباشرة بالصفحة بدون iframe
                    directStream = await extractM3u8(data);
                }

                // 3. فحص البث المباشر المباشر للتأكد من عمله
                if (directStream) {
                    console.log(`⚡ تم العثور على رابط بث مباشر، جاري فحص استقراره...`);
                    const isLiveWorking = await verifyStreamUrl(directStream);
                    if (!isLiveWorking) {
                        console.log(`❌ الرابط المستخرج لا يعمل حالياً (قد يكون التشفير تغير أو البث متوقف)`);
                        directStream = ""; // تصفيره لكي لا يسبب مشكلة للمشغل بالملف المخرج
                    } else {
                        console.log(`✅ الرابط يعمل بنجاح 100%!`);
                    }
                }

            } catch (err) {
                console.log(`⚠️ فشل الدخول لصفحة المباراة: ${rawMatch.detailsUrl}`);
            }
        }

        // 4. بناء الكائن النهائي بالهيكل الثابت المستقر المطلق لتطبيقك
        const structuredMatch = {
            team1: rawMatch.team1,
            team1Logo: rawMatch.team1Logo,
            team2: rawMatch.team2,
            team2Logo: rawMatch.team2Logo,
            time: rawMatch.time,
            status: rawMatch.status,
            channel: rawMatch.channel,
            league: rawMatch.league,
            streamUrl: streamUrl, 
            stream: directStream     
        };

        finalMatches.push(structuredMatch);
        processedPairs.add(matchKey);
    }

    // 5. حفظ البيانات بالهيكل النهائي الثابت
    fs.writeFileSync('matches.json', JSON.stringify(finalMatches, null, 2), 'utf8');
    console.log("------------------------------------");
    console.log(`📊 انتهت العملية بنجاح! تم حفظ ${finalMatches.length} مباراة فريدة في ملف matches.json`);
}

main();
