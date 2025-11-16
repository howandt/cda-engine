// Diagnoser API - Alle 15 diagnoser med fuld dokumentation
// Hans' 9000+ timers arbejde samlet i ét API

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      allowed_methods: ['GET']
    });
  }

  try {
    // Hent query parameters
    const { 
      id,           // Specifik diagnose ID (f.eks. "adhd")
      kategori,     // Filter efter kategori
      search,       // Søg i navn, symptomer, nøgleord
      komorbiditet  // Find diagnoser med specifik komorbiditet
    } = req.query;

    // Fetch data fra GitHub
    const dataUrl = 'https://raw.githubusercontent.com/howandt/cda-engine-clean/refs/heads/main/data/CDA_Diagnoser.json';
    
    const response = await fetch(dataUrl, {
      headers: {
        'Cache-Control': 'max-age=3600' // 1 times cache
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub fetch failed: ${response.status}`);
    }

    const data = await response.json();

    // Hvis specifik ID er angivet
    if (id) {
      const diagnose = data.diagnoser.find(d => 
        d.id.toLowerCase() === id.toLowerCase()
      );
      
      if (!diagnose) {
        return res.status(404).json({
          error: 'Diagnose ikke fundet',
          requested_id: id,
          available_ids: data.diagnoser.map(d => d.id)
        });
      }
      
      return res.status(200).json({
        version: data.version,
        diagnose: diagnose
      });
    }

    // Start med alle diagnoser
    let filteredDiagnoser = [...data.diagnoser];

    // Filter efter kategori
    if (kategori) {
      filteredDiagnoser = filteredDiagnoser.filter(d => 
        d.kategori.toLowerCase().includes(kategori.toLowerCase())
      );
    }

    // Filter efter komorbiditet
    if (komorbiditet) {
      filteredDiagnoser = filteredDiagnoser.filter(d => {
        if (!d.komorbiditet_links || d.komorbiditet_links.length === 0) {
          return false;
        }
        
        // Tjek om nogen af komorbiditet links indeholder søgningen
        return d.komorbiditet_links.some(link => {
          if (typeof link === 'string') {
            return link.toLowerCase().includes(komorbiditet.toLowerCase());
          }
          return false;
        });
      });
    }

    // Søgning i navn, symptomer, nøgleord og indhold
    if (search) {
      const searchLower = search.toLowerCase();
      
      filteredDiagnoser = filteredDiagnoser.filter(d => {
        // Søg i navn
        if (d.navn.toLowerCase().includes(searchLower) ||
            d.fuld_navn.toLowerCase().includes(searchLower)) {
          return true;
        }
        
        // Søg i symptomer
        if (d.hovedsymptomer && Array.isArray(d.hovedsymptomer)) {
          if (d.hovedsymptomer.some(s => 
            s.toLowerCase().includes(searchLower)
          )) {
            return true;
          }
        }
        
        // Søg i nøgleord
        if (d.noegleord && Array.isArray(d.noegleord)) {
          if (d.noegleord.some(n => 
            n.toLowerCase().includes(searchLower)
          )) {
            return true;
          }
        }
        
        // Søg i markdown indhold
        if (d.indhold_markdown) {
          return d.indhold_markdown.toLowerCase().includes(searchLower);
        }
        
        return false;
      });
    }

    // Return filtered results
    return res.status(200).json({
      version: data.version,
      description: data.description,
      total_diagnoser: data.total_diagnoser,
      filtered_count: filteredDiagnoser.length,
      filters_applied: {
        id: id || null,
        kategori: kategori || null,
        search: search || null,
        komorbiditet: komorbiditet || null
      },
      diagnoser: filteredDiagnoser
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}