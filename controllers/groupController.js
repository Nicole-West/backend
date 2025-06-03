const db = require('../db');

// Получить студентов группы
exports.getStudentsByGroupId = async (req, res) => {
  const groupId = req.params.id;
  console.log(`[GET] /api/group/${groupId} — Получение студентов группы`);

  try {
    const [rows] = await db.query('CALL GetCurrentGroupStudents(?)', [groupId]);
    const students = rows;
    res.json({ students });
  } catch (err) {
    console.error('Ошибка при получении студентов:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

// Получить предметы преподавателя для группы
exports.getSubjectsByGroupIdAndTeacherId = async (req, res) => {
  const groupId = req.params.id;
  const teacherId = req.params.user_id;

  console.log(`[GET] /api/group/${groupId}/subjects/${teacherId} — Получение предметов преподавателя для группы`);
 
  try {
    const [teacherRole] = await db.query(
      `SELECT role FROM users WHERE user_id = ?`,
      [teacherId]
    );

    const isSeniorTeacher = teacherRole[0]?.role === 'senior_teacher';

    let query, params;

    if (isSeniorTeacher) {
      query = `
          SELECT DISTINCT s.subject_id, s.subject_name
          FROM subjects s
          JOIN course_subjects cs ON s.subject_id = cs.subject_id
          JOIN group_subjects gs ON cs.course_subject_id = gs.course_subject_id
          JOIN group_history gh ON gs.group_id = gh.group_id
          JOIN academic_years ay ON gh.year_id = ay.year_id
          WHERE 
              gs.group_id = ?
              AND gs.status = 'active'
              AND ay.is_current = TRUE
          ORDER BY s.subject_name;
      `;
      params = [groupId];
    } else {
      query = `
          SELECT DISTINCT s.subject_id, s.subject_name
          FROM subjects s
          JOIN course_subjects cs ON s.subject_id = cs.subject_id
          JOIN group_subjects gs ON cs.course_subject_id = gs.course_subject_id
          JOIN teacher_assignments ta ON gs.group_subject_id = ta.group_subject_id
          JOIN teachers t ON ta.teacher_id = t.teacher_id
          JOIN group_history gh ON gs.group_id = gh.group_id
          JOIN academic_years ay ON gh.year_id = ay.year_id
          WHERE 
              t.user_id = ?
              AND gs.group_id = ?
              AND gs.status = 'active'
              AND ay.is_current = TRUE
          ORDER BY s.subject_name;
      `;
      params = [teacherId, groupId];
    }

    const [rows] = await db.query(query, params);
    res.json({ subjects: rows.length > 0 ? rows : [] });
  } catch (err) {
    console.error('Ошибка при получении предметов:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

// Получить оценки
exports.getGradesByGroupIdAndSubjectId = async (req, res) => {
  const groupId = req.params.groupId;
  const subjectId = req.params.subjectId;

  console.log(`[GET] /api/group/\${groupId}/subjects/\${subjectId}/grades — Получение оценок`);

  try {
    const [yearRow] = await db.query(`SELECT year_id FROM academic_years WHERE is_current = TRUE LIMIT 1`);
    const [monthRow] = await db.query(`
        SELECT month_id FROM active_months WHERE is_attestation_month = TRUE AND year_id = ?
        LIMIT 1
      `, [yearRow[0].year_id]);

    const yearId = yearRow[0].year_id;
    const monthId = monthRow[0]?.month_id;

    if (!monthId) return res.status(404).json({ message: 'Нет активного месяца' });

    const [groupSubjectRow] = await db.query(`
        SELECT gs.group_subject_id
        FROM group_subjects gs
        JOIN course_subjects cs ON gs.course_subject_id = cs.course_subject_id
        WHERE gs.group_id = ? AND cs.subject_id = ? AND gs.status = 'active'
      `, [groupId, subjectId]);

    const groupSubjectId = groupSubjectRow[0]?.group_subject_id;
    if (!groupSubjectId) return res.status(404).json({ message: 'Связь группа/предмет не найдена' });

    const [students] = await db.query(`
        SELECT 
          s.student_id,
          s.full_name,
          g.grade_id,
          g.grade
        FROM students s
        JOIN student_history sh ON s.student_id = sh.student_id
        LEFT JOIN grades g ON sh.history_id = g.student_history_id 
                            AND g.group_subject_id = ? AND g.month_id = ?
        WHERE sh.group_id = ? AND sh.year_id = ? AND sh.status = 'active'
        ORDER BY s.full_name
      `, [groupSubjectId, monthId, groupId, yearId]);

    res.json({ students });
  } catch (err) {
    console.error('Ошибка при получении оценок:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

// Сохранить оценки
exports.saveGrades = async (req, res) => {
  const groupId = req.params.groupId;
  const subjectId = req.params.subjectId;
  const grades = req.body.grades;
  const editorId = req.body.editor_id;

  console.log(`[POST] /api/group/\${groupId}/subject/\${subjectId}/grades — Сохранение оценок`);

  try {
    const [yearRow] = await db.query(`SELECT year_id FROM academic_years WHERE is_current = TRUE LIMIT 1`);
    const [monthRow] = await db.query(`
        SELECT month_id FROM active_months WHERE is_attestation_month = TRUE AND year_id = ?
        LIMIT 1
      `, [yearRow[0].year_id]);

    const yearId = yearRow[0].year_id;
    const monthId = monthRow[0]?.month_id;

    if (!monthId) return res.status(404).json({ message: 'Нет активного месяца' });

    const [groupSubjectRow] = await db.query(`
        SELECT gs.group_subject_id
        FROM group_subjects gs
        JOIN course_subjects cs ON gs.course_subject_id = cs.course_subject_id
        WHERE gs.group_id = ? AND cs.subject_id = ? AND gs.status = 'active'
      `, [groupId, subjectId]);

    const groupSubjectId = groupSubjectRow[0]?.group_subject_id;
    if (!groupSubjectId) return res.status(404).json({ message: 'Связь группа/предмет не найдена' });

    for (const { student_id, grade } of grades) {
      const [historyRow] = await db.query(`
          SELECT history_id FROM student_history 
          WHERE student_id = ? AND group_id = ? AND year_id = ? AND status = 'active'
          LIMIT 1
        `, [student_id, groupId, yearId]);

      const studentHistoryId = historyRow[0]?.history_id;
      if (!studentHistoryId) continue;

      const [existingGrade] = await db.query(`
          SELECT grade_id FROM grades 
          WHERE student_history_id = ? AND group_subject_id = ? AND month_id = ?
          LIMIT 1
        `, [studentHistoryId, groupSubjectId, monthId]);

      if (existingGrade.length > 0) {
        await db.query(`
            UPDATE grades 
            SET grade = ?, last_edited_by = ?
            WHERE grade_id = ?
          `, [grade, editorId, existingGrade[0].grade_id]);
      } else {
        await db.query(`
            INSERT INTO grades (student_history_id, group_subject_id, month_id, last_edited_by, grade)
            VALUES (?, ?, ?, ?, ?)
          `, [studentHistoryId, groupSubjectId, monthId, editorId, grade]);
      }
    }

    res.json({ message: 'Оценки успешно сохранены' });
  } catch (err) {
    console.error('Ошибка при сохранении оценок:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};