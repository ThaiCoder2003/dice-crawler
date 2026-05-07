import axios, { all } from 'axios';
import XLSX from 'xlsx';
import * as cheerio from 'cheerio';
import fs from 'fs';
import FormData from 'form-data';
import { createRequire } from 'module';
import { Catbox } from 'node-catbox';

const require = createRequire(import.meta.url);

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
    const appScript = "https://script.google.com/macros/s/AKfycbwZyM19-hv2Z9Fz1z4lgnaOftjC4mDsCQrsD9IxTI3ChnjUBmoReELMOhQ8dIqsOHiY/exec";

async function uploadToCatbox(filePath) {
    const catbox = new Catbox();
    try {
        const response = await catbox.uploadFile({ path: filePath });
        console.log("✅ File đã được tải lên Catbox:", response);
        return response;
    } catch (error) {
        console.error("❌ Lỗi tải lên Catbox:", error.message);
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
    let allJobs = [];
    const diceUrl = `https://www.dice.com/jobs?q=artificial+intelligence&location=California&radius=25&fromage=3`;
}