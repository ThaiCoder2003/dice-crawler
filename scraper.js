import axios, { all } from 'axios';
import XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { Catbox } from 'node-catbox';
import FormData from 'form-data';

const DICE_FILTER_OPTIONS = {
    postedDate: ['ONE', 'THREE', 'SEVEN'],
    workplaceTypes: ['On-Site', 'Remote', 'Hybrid'],
    employmentTypes: [
        'FULLTIME',
        'CONTRACT',
        'PARTTIME',
        'THIRD_PARTY'
    ],
    employerTypes: [
        'Direct Hire',
        'Recruiter',
        'Other'
    ]
};

const filters = {
    easyApply: true,
    postedDate: 'THREE',
    workplaceTypes: ['On-Site'],
    employmentTypes: ['FULLTIME', 'CONTRACT'],
    employerTypes: ['Direct Hire']
}

let existingKeys = new Set();
    const appScript = "https://script.google.com/macros/s/AKfycbxnxVBqk-kTcm7dbPnT-Lcxjjbz6Fu1km9TpoLoonU-rt6ojftsKeNe7V7yz6Zes5FXLA/exec";

async function uploadToCatbox(filePath) {
    try {
        const form = new FormData();

        form.append("reqtype", "fileupload");
        form.append(
            "fileToUpload",
            fs.createReadStream(filePath)
        );

        const response = await axios.post(
            "https://catbox.moe/user/api.php",
            form,
            {
                headers: form.getHeaders(),
                maxBodyLength: Infinity
            }
        );

        console.log(
            "✅ File đã được tải lên Catbox:",
            response.data
        );

        return response.data;

    } catch (error) {
        console.error(
            "❌ Lỗi tải lên Catbox:",
            error.message
        );

        return null;
    }
}

async function sendToGoogleSheets(jobs, catboxLink, totalJobs) {
    const payload = { 
        jobs,
        link: catboxLink,
        total: totalJobs
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
    let maxPages= 2;
    let allJobs = [];


    // Crawl theo tung trang
    for (let page = 1; page <= maxPages; i++) {
        const diceUrl = buildDiceUrl({
            query: 'Software Engineer',
            location: 'California',
            page,
            filters
        });

        let attempts = 0;
        const maxAttempts = 2;

        while (attempts < maxAttempts) {
            try {
                attempts++;
                console.log(`🔍 Quét trang: ${page} (Lần ${attempts})...`);

                const response = await axios.get('http://api.scraperapi.com', {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9'
                    },
                    params: {
                        api_key: process.env.SCRAPER_API_KEY,
                        url: diceUrl,
                        country_code: 'us',
                        render: true
                    },
                    timeout: 60000
                });

                const $ = cheerio.load(response.data);

                if (!$('[data-testid="job-card"]').length) {
                    console.log("🚫 Blocked or invalid page");
                    break;
                }

                let count = 0;

                $('[data-testid="job-card"]').each((i, el) => {
                    // Search a with data-testid job-search-job-detail-link
                    const titleEl = $(el).find('a[data-testid="job-search-job-detail-link"]').first();

                    const title = titleEl.text().trim();

                    const link = titleEl
                        .attr('href');

                    const jobId = $(el)
                        .attr('data-job-guid');

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
                        page
                    };

                    allJobs.push(job);
                    existingKeys.add(jobId);
                })



                break;
            } catch (error) {
                console.error(`❌ Lỗi khi quét trang ${page} (Lần ${attempts}):`, error.message);
                if (attempts >= maxAttempts) {
                    console.error(`❌ Đã đạt số lần thử tối đa cho trang ${page}. Bỏ qua...`);
                } else {
                    console.log(`🔄 Thử lại trang ${i}...`);
                }
            }
       }

       await new Promise(resolve =>
            setTimeout(resolve, 30000)
        );
    }

    if (allJobs.length > 0) {
        const fileName = `Dice_Jobs_${new Date().toISOString().slice(0,10)}.xlsx`;
        const workbook = XLSX.utils.book_new();
        const refinedData = allJobs.map(job => ({
            ID: job.id,
            Title: job.title,
            Company: job.company,
            Location: job.location,
            Salary: job.salary,
            "Easy Apply": job.easyApply,
            Description: job.description,
            "Employment Type": job.employmentType,
            Link: { f: `HYPERLINK("${job.link.replace(/"/g, '""')}", "Apply")` },
            Page: job.page
        }));

        const worksheet = XLSX.utils.json_to_sheet(refinedData);

        worksheet['!freeze'] = { ySplit: 1 };
        worksheet['!autofilter'] = {
            ref: "A1:J1"
        };

        worksheet['!cols'] = [
            { wch: 40 }, // ID
            { wch: 40 }, // Title
            { wch: 30 }, // Company
            { wch: 20 }, // Location
            { wch: 20 }, // Salary
            { wch: 12 }, // Easy Apply
            { wch: 80 }, // Description
            { wch: 20 }, // Employment Type
            { wch: 50 }, // Link
            { wch: 10 }  // Page
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, "Dice Jobs");

        const summaryData = [
            ["Dice Job Report"],
            [""],
            ["Date", new Date().toLocaleString()],
            ["Total Jobs", allJobs.length],
            ["Location", "California, USA"]
        ];

        const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
        XLSX.writeFile(workbook, fileName);

        if (!fs.existsSync(fileName)) {
            throw new Error("XLSX file was not created.");
        }

        console.log(`📊 Đã lưu ${allJobs.length} jobs vào ${fileName}`);

        const catboxLink = await uploadToCatbox(fileName);

        if (catboxLink) {
            console.log("✅ Catbox URL:", catboxLink);
        } else {
            console.log("❌ Catbox thất bại.");
        }

        await sendToGoogleSheets(
            allJobs,
            catboxLink,
            allJobs.length
        )

        console.log("🏁 Hoàn tất!");
    } else {
        console.log("❌ Không tìm thấy job nào.");
    }
}

runScraper();