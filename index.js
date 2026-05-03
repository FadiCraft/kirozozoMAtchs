const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://d.syrlive.com/matches-today/';

// دالة للتحقق من عمل الرابط
async function checkUrl(url) {
    if (!url) return "";
    try {
        const response = await axios.head(url, { timeout: 3000 });
        return response.status === 200 ? url : "";
    } catch (e) {
        return "";
    }
}

// دالة لاستخراج الرابط المباشر من داخل السيرفر (iframe)
async function getDirectStream(iframeUrl) {
    if (!iframeUrl) return null;
    try {
        // إضافة User-Agent لضمان عدم الحظر
        const { data } = await axios.get(iframeUrl, { 
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 7000 
        });

        // البحث عن روابط m3u8 داخل كود السيرفر
        const m3u8Regex = /https?:\/\/[^"']+\.m3u8[^"']*/g;
        const matches = data.match(m3u8Regex);

        if (matches && matches.length > 0) {
            return matches[0].split('\\').join(''); // تنظيف الرابط من أي علامات هروب
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function getMatchDetails(matchUrl) {
    try {
        const { data } = await axios.get(matchUrl, { timeout: 8000 });
        const $ = cheerio.load(data);
        
        // 1. استخراج رابط السيرفر من الـ iframe
        let iframeSrc = $('iframe.cf').attr('src') || $('iframe').attr('src');
        
        if (!iframeSrc) return { main: "" };

        // 2. محاولة استخراج الرابط المباشر (m3u8) من داخل صفحة السيرفر
        const directM3u8 = await getDirectStream(iframeSrc);
        
        if (!directM3u8) return { main: iframeSrc }; // إذا لم نجد m3u8 نرجع رابط السيرفر كبديل

        // 3. بناء الجودات بناءً على الرابط المستخرج
        let results = {
            main: directM3u8,
            p1080: "",
            p720: "",
            p480: "",
            p144: ""
        };

        // فحص إذا كان الرابط يتبع النمط المطلوب لتوليد الجودات
        if (directM3u8.includes('_1080p')) {
            results.p1080 = directM3u8;
            results.p720 = await checkUrl(directM3u8.replace('_1080p', '_720p'));
            results.p480 = await checkUrl(directM3u8.replace('_1080p', '_480p'));
            results.p144 = await checkUrl(directM3u8.replace('_1080p', '_144p'));
        }

        return results;
    } catch (e) {
        return { main: "" };
    }
}

async function scrapeMatches() {
    try {
        console.log("🚀 جاري فحص المباريات واستخراج الروابط المباشرة...");
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
                streamUrl: "",
                stream_1080: "",
                stream_720: "",
                stream_480: "",
                stream_144: ""
            };

            if (detailsUrl) {
                console.log(`🔗 معالجة: ${match.team1} vs ${match.team2}`);
                const streams = await getMatchDetails(detailsUrl);
                
                match.streamUrl = streams.main || "";
                match.stream_1080 = streams.p1080 || "";
                match.stream_720 = streams.p720 || "";
                match.stream_480 = streams.p480 || "";
                match.stream_144 = streams.p144 || "";
            }

            matches.push(match);
        }

        fs.writeFileSync('matches.json', JSON.stringify(matches, null, 2), 'utf8');
        console.log("✅ تم التحديث بنجاح في ملف matches.json");

    } catch (error) {
        console.error('❌ خطأ:', error.message);
    }
}

scrapeMatches();
