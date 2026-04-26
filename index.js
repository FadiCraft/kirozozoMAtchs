const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const URL = 'https://www.koora4lives.site/'; // رابط الموقع

async function scrapeMatches() {
    try {
        const { data } = await axios.get(URL);
        const $ = cheerio.load(data);
        const matches = [];

        $('.AY_Match').each((i, el) => {
            const match = {
                team1: $(el).find('.TM1 .TM_Name').text().trim(),
                team1Logo: $(el).find('.TM1 img').attr('data-src') || $(el).find('.TM1 img').attr('src'),
                team2: $(el).find('.TM2 .TM_Name').text().trim(),
                team2Logo: $(el).find('.TM2 img').attr('data-src') || $(el).find('.TM2 img').attr('src'),
                time: $(el).find('.MT_Time').text().trim(),
                result: $(el).find('.MT_Result').text().trim().replace(/\s+/g, ''),
                status: $(el).find('.MT_Stat').text().trim(),
                league: $(el).find('.TourName').text().trim(),
                detailsUrl: $(el).find('a').attr('href')
            };
            matches.push(match);
        });

        // حفظ البيانات في ملف JSON
        fs.writeFileSync('matches.json', JSON.stringify(matches, null, 2));
        console.log('Successfully updated matches.json');

    } catch (error) {
        console.error('Error scraping data:', error.message);
    }
}

scrapeMatches();
