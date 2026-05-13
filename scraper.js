import axios, { all } from 'axios';
import XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import fs from 'fs';


// This is the filter options you can pick for Dice URL construct. Feel free to fill in the filter JSON below
// const DICE_FILTER_OPTIONS = {
//     postedDate: ['ONE', 'THREE', 'SEVEN'],
//     workplaceTypes: ['On-Site', 'Remote', 'Hybrid'],
//     employmentTypes: [
//         'FULLTIME',
//         'CONTRACT',
//         'PARTTIME',
//         'THIRD_PARTY'
//     ],
//     employerTypes: [
//         'Direct Hire',
//         'Recruiter',
//         'Other'
//     ]
// };

const queries = ["Artificial Intelligence", "Data", "Finance", "Investment", "Machine Learning", "Management"];

const filters = {
    // easyApply: false,
    // workplaceTypes: ['Remote', 'Hybrid'],
    employmentTypes: ['FULLTIME'],
    // employerTypes: ['Direct Hire']
}

let existingKeys = new Set();
const appScript = "https://script.google.com/macros/s/AKfycbyIfOaNX3JhoEV8pUTbTui2DWoHXyAnvz0O9cdnPN6yjEGg2rpRMJnlY9Wpu8at3nJV6Q/exec";

async function sendToGoogleSheets(jobs) {
    const payload = { 
        jobs,
    };

    try {
        const response = await axios.post(appScript, payload, {
            headers: { "Content-Type": "application/json" }
        });

        if (response.data && response.data.status === "success") {
            console.log("✅ Đã gửi dữ liệu lên Google Sheets thành công!");
        }

        else {
            console.error("❌ Lỗi từ Google Sheets:", response.data.message || "Unknown error");
        }
    } catch (error) {
        console.error("❌ Lỗi gửi lên Google Sheets:", error.message);
    }
}

function serializeFilter(values, map = null) {
    const result = values
        ?.map(v => map ? map[v] : v)
        .filter(Boolean)
        .join('|');

    return result || null;
}

function buildDiceUrl({
    query,
    location,
    latitude = null,
    longitude = null,
    countryCode = 'US',
    locationPrecision,
    adminDistrictCode,
    page = 1,
    filters = {}
}) {
    const baseUrl = 'https://www.dice.com/jobs';
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (location) params.set('location', location);
    if (latitude != null) params.set('latitude', latitude);
    if (longitude != null) params.set('longitude', longitude);
    if (countryCode) params.set('countryCode', countryCode);
    if (locationPrecision) params.set('locationPrecision', locationPrecision);
    if (adminDistrictCode) params.set('adminDistrictCode', adminDistrictCode);
    if (page != null && page > 1) params.set('page', page);

    buildDiceFilters(params, filters);

    const queryString = params.toString();

    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

function buildDiceFilters(params, filters) {
    if (filters.easyApply) params.set('filters.easyApply', 'true');
    if (filters.postedDate) params.set('filters.postedDate', filters.postedDate);
    const workplace = serializeFilter(
        filters.workplaceTypes,
        {
            'On-Site': 'On-Site',
            'Remote': 'Remote',
            'Hybrid': 'Hybrid'
        }
    );

    if (workplace) {
        params.set(
            'filters.workplaceTypes',
            workplace
        );
    }

        const employment = serializeFilter(
        filters.employmentTypes,
        {
            'FULLTIME': 'FULLTIME',
            'CONTRACT': 'CONTRACT',
            'PARTTIME': 'PARTTIME',
            'THIRD_PARTY': 'THIRD_PARTY',

            'Full-Time': 'FULLTIME',
            'Contract': 'CONTRACT',
            'Part-Time': 'PARTTIME',
            'Third Party': 'THIRD_PARTY'
        }
    );

    if (employment) {
        params.set(
            'filters.employmentType',
            employment
        );
    }

    const employer = serializeFilter(
        filters.employerTypes,
        {
            'Direct Hire': 'Direct Hire',
            'Recruiter': 'Recruiter',
            'Other': 'Other'
        }
    );

    if (employer) {
        params.set(
            'filters.employerType',
            employer
        );
    }
}

async function runScraper() {
    console.log("🚀 Khởi động Scraper...");
    let maxPages= 1;
    let allJobs = [];

    for (const selected of queries) {
    let newJobsForThisQuery = [];

        let isLastPage = false
        let previousFirstJobId = null;
    // Crawl theo tung trang
        for (let page = 1; page <= maxPages; page++) {
            const diceUrl = buildDiceUrl({
                query: selected,
                location: 'California',
                page,
                filters
            });

            let attempts = 0;
            const maxAttempts = 2;

            while (attempts < maxAttempts) {
                try {
                    attempts++;
                    console.log(`🔍[${selected}] Quét trang: ${page} (Lần ${attempts})...`);

                    const response = await axios.get('http://api.scraperapi.com', {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            'Accept-Language': 'en-US,en;q=0.9'
                        },
                        params: {
                            api_key: process.env.SCRAPER_API_KEY,
                            url: diceUrl,
                            country_code: 'us',
                        },
                        timeout: 60000
                    });

                    const $ = cheerio.load(response.data);

                    const jobCards = $('[data-testid="job-card"]');

                    if (!jobCards.length) {

                        const bodyText = $('body').text();
                        const normalizedBody = bodyText.toLowerCase();
                        // Truly blocked
                        if (
                            normalizedBody.includes('access denied') ||
                            normalizedBody.includes('captcha') ||
                            normalizedBody.includes('temporarily blocked') ||
                            normalizedBody.includes('verify you are human') ||
                            normalizedBody.includes('checking your browser') ||
                            normalizedBody.includes('just a moment') ||
                            normalizedBody.includes('cloudflare') 
                        ) {
                            console.log(`🚫 Actually blocked on page ${page}`);

                            fs.mkdirSync('./output', { recursive: true });

                            fs.writeFileSync(
                                `./output/debug_blocked_page_${page}.html`,
                                response.data
                            );

                            break;
                        }

                        isLastPage = true;

                        // No more jobs
                        console.log(`✅ No more jobs found on page ${page}`);
                        break;
                    }
                    // End quickly here

                    const firstJobId = jobCards.first().attr('data-job-guid');

                    if (firstJobId && firstJobId === previousFirstJobId) {
                        console.log("⚠️ Duplicate page detected. Stopping.");
                        isLastPage = true;
                        break;
                    }

                    previousFirstJobId = firstJobId;

                    $('[data-testid="job-card"]').each((i, el) => {
                        // Search a with data-testid job-search-job-detail-link
                        const titleEl = $(el).find('a[data-testid="job-search-job-detail-link"]').first();

                        const title = titleEl.text().trim();

                        const link = titleEl
                            .attr('href');

                        const jobId = $(el)
                            .attr('data-job-guid');

                        if (!jobId) return;

                        if (existingKeys.has(jobId)) return;

                        const companyEl = $(el)
                            .find('a[href*="/company-profile/"] p')
                            .first();

                        const company = companyEl
                            .text()
                            .trim();

                        const content = $(el).find('.content')
                        let location = 'N/A'
                        const locationElement = content
                            .find('.text-zinc-600')
                            .first();

                        if (locationElement.length) {
                            location = locationElement.text().trim();
                        };

                        const description = content
                            .find('.line-clamp-2.h-10')
                            .text()
                            .trim();

                        const employmentType = content
                            .find('#employmentType-label')
                            .text()
                            .trim();

                        const salary = content
                            .find('#salary-label')
                            .text()
                            .trim();

                        const easyApply = $(el)
                            .find('a[href*="/job-detail/"]')
                            .filter((_, a) =>
                                $(a).text().trim().includes('Easy Apply')
                            )
                            .length > 0;
                        
                        const job = {
                            id: jobId,
                            title,
                            link,
                            company,
                            location,
                            description,
                            employmentType,
                            salary,
                            easyApply,
                            page,
                            query: selected
                        };

                        newJobsForThisQuery.push(job);
                        existingKeys.add(jobId);
                    })

                    break;
                } catch (error) {
                    console.error(`❌ Lỗi khi quét trang ${page} (Lần ${attempts}):`, error.message);
                    if (attempts >= maxAttempts) {
                        console.error(`❌ Đã đạt số lần thử tối đa cho trang ${page}. Bỏ qua...`);
                    } else {
                        console.log(`🔄 Thử lại trang ${page}...`);
                    }
                }
            }

            if (newJobsForThisQuery.length > 0) {
                console.log(`✅ Query "${selected}" có ${newJobsForThisQuery.length} job mới.`);
                allJobs = allJobs.concat(newJobsForThisQuery);
            }

            if (isLastPage) {
                console.log("🛑 Stopping crawl early.");
                break;
            }

            await new Promise(resolve =>
                setTimeout(resolve, 5000)
            );
        }
    }

    if (allJobs.length > 0) {
        await sendToGoogleSheets(
            allJobs,
        )

        console.log("🏁 Hoàn tất!");
    } else {
        console.log("❌ Không tìm thấy job nào.");
    }
}

runScraper();