// Vercel Serverless Function - Rollespil API med caching
const fetch = require('node-fetch');

// In-memory cache
let cache = {
  all: { data: null, timestamp: 0 },
  cases: {}
};

const CACHE_DURATION = 1000 * 60 * 60; // 1 time
const GITHUB_URL = 'https://raw.githubusercontent.com/howandt/cda-engine-clean/main/data/rollespil_scenarier.json';

function isCacheValid(cacheKey) {
  const cached = cacheKey === 'all' ? cache.all : cache.cases[cacheKey];
  if (!cached || !cached.data) return false;
  const age = Date.now() - cached.timestamp;
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
    const { caseId } = req.query;

    // Hvis caseId er angivet, returner kun den case
    if (caseId) {
      if (isCacheValid(caseId)) {
        console.log(`[CACHE HIT] Rollespil case: ${caseId}`);
        return res.status(200).json({
          source: 'cache',
          data: cache.cases[caseId].data,
          cached_at: new Date(cache.cases[caseId].timestamp).toISOString()
        });
      }

      console.log(`[CACHE MISS] Rollespil case: ${caseId}`);
      const allData = await fetchFromGitHub();
      const caseData = allData.find(item => item.id === caseId);
      
      if (!caseData) {
        return res.status(404).json({
          error: 'Case ikke fundet',
          available_cases: allData.map(item => item.id)
        });
      }

      cache.cases[caseId] = { data: caseData, timestamp: Date.now() };
      return res.status(200).json({
        source: 'github',
        data: caseData,
        fetched_at: new Date().toISOString()
      });
    }

    // Hvis ingen caseId, returner alle rollespil
    if (isCacheValid('all')) {
      console.log('[CACHE HIT] Rollespil (alle)');
      return res.status(200).json({
        source: 'cache',
        data: cache.all.data,
        cached_at: new Date(cache.all.timestamp).toISOString()
      });
    }

    console.log('[CACHE MISS] Rollespil (alle) - fetching from GitHub');
    const data = await fetchFromGitHub();

    cache.all = { data, timestamp: Date.now() };

    return res.status(200).json({
      source: 'github',
      data: data,
      fetched_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Rollespil API error:', error);
    return res.status(500).json({
      error: 'Failed to fetch rollespil data',
      message: error.message
    });
  }
};