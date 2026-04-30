const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const BASE_URL = 'https://www.koraplay.live/matches-today/';

async function getStreamServer(matchUrl) {
    try {
        const { data } = await axios.get(matchUrl, { timeout: 10000 });
        const $ = cheerio.load(data);
        // البحث عن رابط السيرفر داخل iframe
        const iframeSrc = $('iframe.cf').attr('src') || $('iframe').attr('src');
        return iframeSrc || "";
    } catch (e) {
        return "";
    }
}

async function scrapeMatches() {
    try {
        console.log("Starting Scraper for Kiro Zozo...");
        const { data } = await axios.get(BASE_URL);
        const $ = cheerio.load(data);
        const matches = [];

        $('.AY_Match').each((i, el) => {
            const statusText = $(el).find('.MT_Stat').text().trim();
            const detailsUrl = $(el).find('a').attr('href');
            
            // تحديد النوع برمجياً (Type) لسهولة الفلترة في Sketchware
            let matchType = "upcoming"; // الافتراضي
            if (statusText.includes("انتهت")) {
                matchType = "finished";
            } else if (statusText.includes("جاري") || statusText.includes("مباشر") || $(el).hasClass('live')) {
                matchType = "live";
            }

            const match = {
                team1: $(el).find('.TM1 .TM_Name').text().trim(),
                team1Logo: $(el).find('.TM1 img').attr('data-src') || $(el).find('.TM1 img').attr('src'),
                team2: $(el).find('.TM2 .TM_Name').text().trim(),
                team2Logo: $(el).find('.TM2 img').attr('data-src') || $(el).find('.TM2 img').attr('src'),
                time: $(el).find('.MT_Time').text().trim(),
                result: $(el).find('.MT_Result').text().trim().replace(/\s+/g, ''),
                status: statusText,
                type: matchType, // الحقل الجديد للتمييز
                league: $(el).find('.TourName').text().trim(),
                detailsUrl: detailsUrl,
                streamUrl: ""
            };
            matches.push(match);
        });

        // الآن ندخل لصفحات المباريات "اللايف" و "القادمة" لجلب السيرفرات
        for (let match of matches) {
            if (match.type !== "finished" && match.detailsUrl) {
                console.log(`Getting stream for: ${match.team1} vs ${match.team2}`);
                match.streamUrl = await getStreamServer(match.detailsUrl);
            }
        }

        fs.writeFileSync('matches.json', JSON.stringify(matches, null, 2));
        console.log(`Successfully scraped ${matches.length} matches.`);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

scrapeMatches();
