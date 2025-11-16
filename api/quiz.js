// api/quiz.js
// CDA Quiz Motor API with caching

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Fetch quiz bank from GitHub
    const response = await fetch(
      'https://raw.githubusercontent.com/howandt/cda-engine-clean/refs/heads/main/data/CDA_Quiz_Bank.json',
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

    // GET: Retrieve quizzes with filtering
    if (req.method === 'GET') {
      const {
        quiz_id,
        difficulty,
        type,
        keywords,
        source_case,
        public_only
      } = req.query;

      let quizzes = data.quizzes;

      // Filter by quiz_id
      if (quiz_id) {
        const quiz = quizzes.find(q => q.quiz_id === quiz_id);
        if (!quiz) {
          return res.status(404).json({ error: 'Quiz not found' });
        }
        return res.status(200).json({
          version: data.version,
          quiz
        });
      }

      // Filter by difficulty
      if (difficulty) {
        quizzes = quizzes.filter(q => 
          q.difficulty.toLowerCase() === difficulty.toLowerCase()
        );
      }

      // Filter by type
      if (type) {
        quizzes = quizzes.filter(q => 
          q.type.toLowerCase() === type.toLowerCase()
        );
      }

      // Filter by keywords
      if (keywords) {
        const keywordArray = keywords.split(',').map(k => k.trim().toLowerCase());
        quizzes = quizzes.filter(q => 
          keywordArray.some(keyword => 
            q.keywords.some(qk => qk.toLowerCase().includes(keyword))
          )
        );
      }

      // Filter by source_case
      if (source_case) {
        quizzes = quizzes.filter(q => q.source_case === source_case);
      }

      // Filter by public
      if (public_only === 'true') {
        quizzes = quizzes.filter(q => q.public === true);
      }

      // Return list of quizzes (without full questions for overview)
      const quizOverview = quizzes.map(q => ({
        quiz_id: q.quiz_id,
        title: q.title,
        description: q.description,
        type: q.type,
        source_case: q.source_case,
        keywords: q.keywords,
        difficulty: q.difficulty,
        total_possible_points: q.total_possible_points,
        passing_score: q.passing_score,
        question_count: q.questions.length,
        tags: q.tags,
        usage_count: q.usage_count
      }));

      return res.status(200).json({
        version: data.version,
        quiz_system: data.quiz_system,
        total_quizzes: data.metadata.total_quizzes,
        filtered_count: quizOverview.length,
        filters_applied: {
          difficulty: difficulty || null,
          type: type || null,
          keywords: keywords || null,
          source_case: source_case || null,
          public_only: public_only || null
        },
        quizzes: quizOverview,
        api_filters: data.api_filters
      });
    }

    // POST: Submit quiz answers and calculate score
    if (req.method === 'POST') {
      const { quiz_id, answers } = req.body;

      if (!quiz_id || !answers) {
        return res.status(400).json({ 
          error: 'Missing required fields',
          required: ['quiz_id', 'answers']
        });
      }

      // Find the quiz
      const quiz = data.quizzes.find(q => q.quiz_id === quiz_id);
      if (!quiz) {
        return res.status(404).json({ error: 'Quiz not found' });
      }

      // Calculate score
      let totalScore = 0;
      const results = [];

      quiz.questions.forEach((question, index) => {
        const userAnswer = answers[index];
        
        if (userAnswer !== undefined && userAnswer !== null) {
          const selectedOption = question.options[userAnswer];
          
          if (selectedOption) {
            totalScore += selectedOption.points;
            
            results.push({
              question_id: question.question_id,
              question: question.question,
              user_answer_index: userAnswer,
              user_answer_text: selectedOption.text,
              points_earned: selectedOption.points,
              feedback: selectedOption.feedback,
              correct: selectedOption.points === 10
            });
          }
        } else {
          results.push({
            question_id: question.question_id,
            question: question.question,
            user_answer_index: null,
            user_answer_text: 'No answer',
            points_earned: 0,
            feedback: 'No answer provided',
            correct: false
          });
        }
      });

      const passed = totalScore >= quiz.passing_score;
      const percentage = Math.round((totalScore / quiz.total_possible_points) * 100);

      return res.status(200).json({
        quiz_id: quiz.quiz_id,
        quiz_title: quiz.title,
        total_score: totalScore,
        possible_points: quiz.total_possible_points,
        passing_score: quiz.passing_score,
        percentage: percentage,
        passed: passed,
        grade: getGrade(percentage),
        results: results,
        summary: {
          correct_answers: results.filter(r => r.correct).length,
          partial_answers: results.filter(r => r.points_earned === 5).length,
          wrong_answers: results.filter(r => r.points_earned < 0 || r.points_earned === 0).length,
          total_questions: quiz.questions.length
        }
      });
    }

  } catch (error) {
    console.error('Quiz API Error:', error);
    res.status(500).json({ 
      error: 'Failed to process quiz request',
      details: error.message 
    });
  }
}

// Helper function to calculate grade
function getGrade(percentage) {
  if (percentage >= 90) return 'A - Fremragende';
  if (percentage >= 80) return 'B - Meget godt';
  if (percentage >= 70) return 'C - Godt';
  if (percentage >= 60) return 'D - Tilstrækkeligt';
  if (percentage >= 50) return 'E - Bestået';
  return 'F - Ikke bestået';
}