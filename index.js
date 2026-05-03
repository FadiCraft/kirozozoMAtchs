const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://d.syrlive.com/matches-today/';

// دالة للتحقق مما إذا كان الرابط يعمل فعلياً
async function checkUrl(url) {
    if (!url) return "";
    try {
        const response = await axios.head(url, { timeout: 5000 });
        return response.status === 200 ? url : "";
    } catch (e) {
        return "";
    }
}

async function getStreamServer(matchUrl) {
    try {
        const { data } = await axios.get(matchUrl, { timeout: 10000 });
        const $ = cheerio.load(data);
        
        // البحث عن أي نص يحتوي على m3u8 داخل السكريبتات أو الـ iframes
        const htmlString = $.html();
        const m3u8Regex = /https?:\/\/[^"']+\.m3u8[^"']*/g;
        const foundUrls = htmlString.match(m3u8Regex);

        let mainUrl = "";
        if (foundUrls && foundUrls.length > 0) {
            mainUrl = foundUrls[0];
        } else {
            // محاولة أخيرة من iframe
            const iframeSrc = $('iframe').attr('src');
            if (iframeSrc && iframeSrc.includes('m3u8')) mainUrl = iframeSrc;
        }

        if (!mainUrl) return { main: "" };

        // إذا وجدنا رابط، نحاول توليد الجودات الأخرى بناءً على النمط المذكور
        const qualities = {
            main: mainUrl,
            p1080: "",
            p720: "",
            p480: "",
            p144: ""
        };

        if (mainUrl.includes('_1080p')) {
            qualities.p1080 = mainUrl;
            qualities.p720 = await checkUrl(mainUrl.replace('_1080p', '_720p'));
            qualities.p480 = await checkUrl(mainUrl.replace('_1080p', '_480p'));
            qualities.p144 = await checkUrl(mainUrl.replace('_1080p', '_144p'));
        } else if (mainUrl.includes('index.m3u8')) {
            // محاولة عامة إذا كان الرابط لا يحتوي على 1080p صراحة
            qualities.p1080 = await checkUrl(mainUrl.replace('index.m3u8', '1080p/index.m3u8'));
            qualities.p720 = await checkUrl(mainUrl.replace('index.m3u8', '720p/index.m3u8'));
        }

        return qualities;
    } catch (e) {
        return { main: "" };
    }
}

async function scrapeMatches() {
    try {
        console.log("جاري استخراج المباريات والروابط المباشرة...");
        const { data } = await axios.get(BASE_URL);
        const $ = cheerio.load(data);
        const matches = [];

        const matchElements = $('.match-container');

        for (let i = 0; i < matchElements.length; i++) {
            const el = matchElements[i];
            let matchType = "upcoming";
            if ($(el).hasClass('live')) matchType = "live";
            else if ($(el).hasClass('end')) matchType = "finished";

            const detailsUrl = $(el).find('a[title]').attr('href') || "";

            const match = {
                team1: $(el).find('.right-team .team-name').text().trim(),
                team1Logo: $(el).find('.right-team img').attr('data-src') || $(el).find('.right-team img').attr('src'),
                team2: $(el).find('.left-team .team-name').text().trim(),
                team2Logo: $(el).find('.left-team img').attr('data-src') || $(el).find('.left-team img').attr('src'),
                time: $(el).find('.match-time').text().trim(),
                result: $(el).find('.result').text().trim(),
                status: $(el).find('.date').text().trim(),
                type: matchType,
                channel: $(el).find('.match-info ul li:nth-child(1) span').text().trim(),
                commentator: $(el).find('.match-info ul li:nth-child(2) span').text().trim(),
                league: $(el).find('.match-info ul li:nth-child(3) span').text().trim(),
                detailsUrl: detailsUrl,
                streamUrl: "",
                stream_1080: "",
                stream_720: "",
                stream_480: "",
                stream_144: "",
                isRandom: false
            };

            // جلب الروابط المباشرة إذا كانت المباراة جارية أو قريبة
            if ((match.type === "live" || match.type === "upcoming") && detailsUrl) {
                console.log(`🔍 فحص السيرفرات لـ: ${match.team1}...`);
                const streamData = await getStreamServer(detailsUrl);
                match.streamUrl = streamData.main || "";
                match.stream_1080 = streamData.p1080 || "";
                match.stream_720 = streamData.p720 || "";
                match.stream_480 = streamData.p480 || "";
                match.stream_144 = streamData.p144 || "";
            }

            matches.push(match);
        }

        fs.writeFileSync('matches.json', JSON.stringify(matches, null, 2), 'utf8');
        console.log(`✅ اكتمل العمل. تم حفظ ${matches.length} مباراة.`);

    } catch (error) {
        console.error('❌ خطأ رئيسي:', error.message);
    }
}

scrapeMatches();
