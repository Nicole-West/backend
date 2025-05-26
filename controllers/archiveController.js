const db = require('../db');

// GET /api/archive/filters
exports.getArchiveFilters = async (req, res) => {
    try {
        // Получаем все доступные годы
        const [years] = await db.query('SELECT year_id, year FROM academic_years ORDER BY year DESC');

        // Получаем все семестры
        const [semesters] = await db.query('SELECT semester_id, semester_number FROM semesters');

        // Получаем все месяцы, которые есть в архиве
        const [months] = await db.query('SELECT DISTINCT month FROM active_months ORDER BY month');

        // Получаем все предметы
        const [subjects] = await db.query('SELECT subject_id, subject_name FROM subjects ORDER BY subject_name');

        // Получаем все группы
        const [groups] = await db.query('SELECT group_id, group_number FROM student_groups ORDER BY group_number');

        res.json({
            success: true,
            data: {
                years,
                semesters,
                months,
                subjects,
                groups
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Ошибка при получении фильтров'
        });
    }
};

// GET /api/archive/data
exports.getArchiveData = async (req, res) => {
    try {
        const { year_id, semester_id, month, subject_id, group_id } = req.query;

        let query = `
        SELECT 
          g.grade_id,
          s.full_name AS student_name,
          sg.group_number,
          sub.subject_name,
          ay.year,
          sm.semester_number,
          am.month,
          g.grade
        FROM grades g
        JOIN student_history sh ON g.student_history_id = sh.history_id
        JOIN students s ON sh.student_id = s.student_id
        JOIN group_subjects gs ON g.group_subject_id = gs.group_subject_id
        JOIN student_groups sg ON sh.group_id = sg.group_id
        JOIN course_subjects cs ON gs.course_subject_id = cs.course_subject_id
        JOIN subjects sub ON cs.subject_id = sub.subject_id
        JOIN active_months am ON g.month_id = am.month_id
        JOIN academic_years ay ON sh.year_id = ay.year_id
        JOIN semesters sm ON sh.semester_id = sm.semester_id
        WHERE 1=1
      `;

        const params = [];

        if (year_id) {
            query += ' AND sh.year_id = ?';
            params.push(year_id);
        }

        if (semester_id) {
            query += ' AND sh.semester_id = ?';
            params.push(semester_id);
        }

        if (month) {
            query += ' AND am.month = ?';
            params.push(month);
        }

        if (subject_id) {
            query += ' AND sub.subject_id = ?';
            params.push(subject_id);
        }

        if (group_id) {
            query += ' AND sg.group_id = ?';
            params.push(group_id);
        }

        query += ' ORDER BY ay.year DESC, sm.semester_number, sg.group_number, s.full_name, sub.subject_name';

        const [data] = await db.query(query, params);

        res.json({
            success: true,
            data
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Ошибка при получении архивных данных'
        });
    }
};