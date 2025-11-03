// Opdateret cases.js for api/cases.js
// Returnerer ALLE cases hvis ingen fil specificeres

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const baseUrl = 'https://raw.githubusercontent.com/howandt/cda-engine-clean/main/data/cases/';
    
    // Liste over alle case filer
    const caseFiles = [
      'adhd_angst_cases.json',
      'autisme_angst_cases.json'
    ];

    // Hvis en specifik fil er anmodet
    const { file } = req.query;
    
    if (file) {
      // Hent specifik fil
      const response = await fetch(`${baseUrl}${file}`);
      
      if (!response.ok) {
        return res.status(404).json({ 
          error: 'File not found',
          requested: file,
          available: caseFiles 
        });
      }
      
      const data = await response.json();
      return res.status(200).json(data);
    }
    
    // INGEN FIL SPECIFICERET - RETURNER ALLE CASES!
    console.log('Fetching all case files...');
    
    const allCases = [];
    const errors = [];
    
    for (const fileName of caseFiles) {
      try {
        const response = await fetch(`${baseUrl}${fileName}`);
        if (response.ok) {
          const data = await response.json();
          // Tilføj alle cases fra denne fil
          if (Array.isArray(data)) {
            allCases.push(...data);
          } else if (data.cases && Array.isArray(data.cases)) {
            allCases.push(...data.cases);
          }
          console.log(`✅ Loaded ${fileName}`);
        } else {
          errors.push(`Failed to load ${fileName}: ${response.status}`);
        }
      } catch (error) {
        errors.push(`Error loading ${fileName}: ${error.message}`);
      }
    }
    
    // Returner alle cases samlet
    return res.status(200).json({
      total_cases: allCases.length,
      source_files: caseFiles,
      cases: allCases,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}