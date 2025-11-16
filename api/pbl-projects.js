// api/pbl-projects.js
// CDA PBL Projects API with caching

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch from GitHub raw URL
    const response = await fetch(
      'https://raw.githubusercontent.com/howandt/cda-engine-clean/refs/heads/main/data/CDA_PBL_Projects.json',
      {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'public, max-age=3600' // Cache 1 hour
        }
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub fetch failed: ${response.status}`);
    }

    const data = await response.json();

    // Query parameters for filtering
    const {
      diagnosis,
      level,
      social,
      structure,
      stimuli,
      id
    } = req.query;

    let projects = data.projects;

    // Filter by ID if requested
    if (id) {
      const project = projects.find(p => p.id === id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      return res.status(200).json({
        version: data.version,
        project
      });
    }

    // Filter by diagnosis
    if (diagnosis) {
      const diagnosisArray = diagnosis.split(',').map(d => d.trim());
      projects = projects.filter(p => 
        diagnosisArray.some(d => 
          p.diagnosis_match.some(dm => 
            dm.toLowerCase().includes(d.toLowerCase())
          )
        )
      );
    }

    // Filter by level
    if (level) {
      projects = projects.filter(p => 
        p.level.toLowerCase() === level.toLowerCase()
      );
    }

    // Filter by social exposure
    if (social) {
      projects = projects.filter(p => 
        p.social_exposure.toLowerCase() === social.toLowerCase()
      );
    }

    // Filter by structure need
    if (structure) {
      projects = projects.filter(p => 
        p.structure_need.toLowerCase() === structure.toLowerCase()
      );
    }

    // Filter by stimuli type
    if (stimuli) {
      const stimuliArray = stimuli.split(',').map(s => s.trim());
      projects = projects.filter(p => 
        stimuliArray.some(s => 
          p.stimuli_type.some(st => 
            st.toLowerCase().includes(s.toLowerCase())
          )
        )
      );
    }

    // Return filtered results
    res.status(200).json({
      version: data.version,
      total_projects: data.total_projects,
      filtered_count: projects.length,
      filters_applied: {
        diagnosis: diagnosis || null,
        level: level || null,
        social: social || null,
        structure: structure || null,
        stimuli: stimuli || null
      },
      projects,
      filter_categories: data.filter_categories,
      teacher_templates: data.teacher_templates,
      matching_algorithm: data.matching_algorithm
    });

  } catch (error) {
    console.error('PBL API Error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch PBL projects',
      details: error.message 
    });
  }
}