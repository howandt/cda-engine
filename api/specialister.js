// Vercel Serverless Function - Specialister API med caching
const fetch = require('node-fetch');

// In-memory cache
let cache = {
  data: null,
  timestamp: 0
};

const CACHE_DURATION = 1000 * 60 * 60; // 1 time
const GITHUB_URL = 'https://raw.githubusercontent.com/howandt/cda-engine-clean/main/data/CDA_SpecialistPanel.json';

function isCacheValid() {
  if (!cache.data) return false;
  const age = Date.now() - cache.timestamp;
  return age < CACHE_DURATION;
}

async function fetchFromGitHub() {
  const response = await fetch(GITHUB_URL);
  if (!response.ok) {
    throw new Error(`GitHub fetch failed: ${response.status}`);
  }
  return await response.json();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (isCacheValid()) {
      console.log('[CACHE HIT] SpecialistPanel');
      return res.status(200).json({
        source: 'cache',
        data: cache.data,
        cached_at: new Date(cache.timestamp).toISOString()
      });
    }

    console.log('[CACHE MISS] SpecialistPanel - fetching from GitHub');
    const data = await fetchFromGitHub();

    cache.data = data;
    cache.timestamp = Date.now();

    return res.status(200).json({
      source: 'github',
      data: data,
      fetched_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('SpecialistPanel API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch specialist panel data',
      message: error.message
    });
  }
};