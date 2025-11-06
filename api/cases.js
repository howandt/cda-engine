// Opdateret cases.js for api/cases.js
// Matcher GPT action format: {success, source, data}
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
          success: false,
          error: 'File not found',
          requested: file,
          available: caseFiles 
        });
      }
      
      const fileData = await response.json();
      
      // Returner i GPT action format
      return res.status(200).json({
        success: true,
        source: file,
        data: {
          total_cases: fileData.cases ? fileData.cases.length : 0,
          source_files: [file],
          cases: fileData.cases || []
        }
      });
    }
    
    // INGEN FIL SPECIFICERET - RETURNER ALLE CASES!
    console.log('Fetching all case files...');
    
    const allCases = [];
    const errors = [];
    
    for (const fileName of caseFiles) {
      try {
        const response = await fetch(`${baseUrl}${fileName}`);
        if (response.ok) {
          const fileData = await response.json();
          // Tilføj alle cases fra denne fil
          if (fileData.cases && Array.isArray(fileData.cases)) {
            allCases.push(...fileData.cases);
            console.log(`✅ Loaded ${fileName}: ${fileData.cases.length} cases`);
          }
        } else {
          errors.push(`Failed to load ${fileName}: ${response.status}`);
        }
      } catch (error) {
        errors.push(`Error loading ${fileName}: ${error.message}`);
      }
    }
    
    // Returner alle cases i GPT action format
    return res.status(200).json({
      success: true,
      source: 'all_files',
      data: {
        total_cases: allCases.length,
        source_files: caseFiles,
        cases: allCases,
        errors: errors.length > 0 ? errors : undefined
      }
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error',
      message: error.message 
    });
  }
}