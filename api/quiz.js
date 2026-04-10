import fs from "fs";
import path from "path";

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Datafil ikke fundet: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function getGrade(percentage) {
  if (percentage >= 90) return "A - Fremragende";
  if (percentage >= 80) return "B - Meget godt";
  if (percentage >= 70) return "C - Godt";
  if (percentage >= 60) return "D - Tilstrækkeligt";
  if (percentage >= 50) return "E - Bestået";
  return "F - Ikke bestået";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const dataPath = path.join(process.cwd(), "data", "CDA_Quiz_Bank.json");
    const data = readJsonFile(dataPath);
    const quizzes = Array.isArray(data.quizzes) ? data.quizzes : [];

    if (req.method === "GET") {
      const {
        quiz_id,
        difficulty,
        type,
        keywords,
        source_case,
        public_only,
      } = req.query;

      let filteredQuizzes = [...quizzes];

      if (quiz_id) {
        const quiz = filteredQuizzes.find((q) => q.quiz_id === quiz_id);

        if (!quiz) {
          return res.status(404).json({ error: "Quiz not found" });
        }

        return res.status(200).json({
          version: data.version || null,
          quiz,
        });
      }

      if (difficulty) {
        filteredQuizzes = filteredQuizzes.filter(
          (q) =>
            String(q.difficulty || "").toLowerCase() ===
            String(difficulty).toLowerCase()
        );
      }

      if (type) {
        filteredQuizzes = filteredQuizzes.filter(
          (q) =>
            String(q.type || "").toLowerCase() === String(type).toLowerCase()
        );
      }

      if (keywords) {
        const keywordArray = String(keywords)
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean);

        filteredQuizzes = filteredQuizzes.filter((q) =>
          keywordArray.some((keyword) =>
            Array.isArray(q.keywords) &&
            q.keywords.some((qk) =>
              String(qk).toLowerCase().includes(keyword)
            )
          )
        );
      }

      if (source_case) {
        filteredQuizzes = filteredQuizzes.filter(
          (q) => String(q.source_case || "") === String(source_case)
        );
      }

      if (public_only === "true") {
        filteredQuizzes = filteredQuizzes.filter((q) => q.public === true);
      }

      const quizOverview = filteredQuizzes.map((q) => ({
        quiz_id: q.quiz_id || null,
        title: q.title || null,
        description: q.description || null,
        type: q.type || null,
        source_case: q.source_case || null,
        keywords: Array.isArray(q.keywords) ? q.keywords : [],
        difficulty: q.difficulty || null,
        total_possible_points: q.total_possible_points || 0,
        passing_score: q.passing_score || 0,
        question_count: Array.isArray(q.questions) ? q.questions.length : 0,
        tags: Array.isArray(q.tags) ? q.tags : [],
        usage_count: q.usage_count || 0,
      }));

      return res.status(200).json({
        version: data.version || null,
        quiz_system: data.quiz_system || null,
        total_quizzes: data.metadata?.total_quizzes || quizzes.length,
        filtered_count: quizOverview.length,
        filters_applied: {
          difficulty: difficulty || null,
          type: type || null,
          keywords: keywords || null,
          source_case: source_case || null,
          public_only: public_only || null,
        },
        quizzes: quizOverview,
        api_filters: data.api_filters || null,
      });
    }

    if (req.method === "POST") {
      const { quiz_id, answers } = req.body || {};

      if (!quiz_id || !answers) {
        return res.status(400).json({
          error: "Missing required fields",
          required: ["quiz_id", "answers"],
        });
      }

      const quiz = quizzes.find((q) => q.quiz_id === quiz_id);

      if (!quiz) {
        return res.status(404).json({ error: "Quiz not found" });
      }

      let totalScore = 0;
      const results = [];

      const questions = Array.isArray(quiz.questions) ? quiz.questions : [];

      questions.forEach((question, index) => {
        const userAnswer = answers[index];

        if (userAnswer !== undefined && userAnswer !== null) {
          const selectedOption =
            Array.isArray(question.options) ? question.options[userAnswer] : null;

          if (selectedOption) {
            totalScore += Number(selectedOption.points || 0);

            results.push({
              question_id: question.question_id || null,
              question: question.question || null,
              user_answer_index: userAnswer,
              user_answer_text: selectedOption.text || null,
              points_earned: Number(selectedOption.points || 0),
              feedback: selectedOption.feedback || null,
              correct: Number(selectedOption.points || 0) === 10,
            });
          } else {
            results.push({
              question_id: question.question_id || null,
              question: question.question || null,
              user_answer_index: userAnswer,
              user_answer_text: "Invalid answer index",
              points_earned: 0,
              feedback: "Answer index not found",
              correct: false,
            });
          }
        } else {
          results.push({
            question_id: question.question_id || null,
            question: question.question || null,
            user_answer_index: null,
            user_answer_text: "No answer",
            points_earned: 0,
            feedback: "No answer provided",
            correct: false,
          });
        }
      });

      const possiblePoints = Number(quiz.total_possible_points || 0);
      const passingScore = Number(quiz.passing_score || 0);
      const percentage =
        possiblePoints > 0 ? Math.round((totalScore / possiblePoints) * 100) : 0;

      return res.status(200).json({
        quiz_id: quiz.quiz_id || null,
        quiz_title: quiz.title || null,
        total_score: totalScore,
        possible_points: possiblePoints,
        passing_score: passingScore,
        percentage,
        passed: totalScore >= passingScore,
        grade: getGrade(percentage),
        results,
        summary: {
          correct_answers: results.filter((r) => r.correct).length,
          partial_answers: results.filter((r) => r.points_earned === 5).length,
          wrong_answers: results.filter(
            (r) => r.points_earned < 0 || r.points_earned === 0
          ).length,
          total_questions: questions.length,
        },
      });
    }
  } catch (error) {
    console.error("Quiz API Error:", error);

    return res.status(500).json({
      error: "Failed to process quiz request",
      details: error.message,
    });
  }
}