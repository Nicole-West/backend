// controllers/statsController.js
const pool = require('../db');

exports.getCurrentStats = async (req, res) => {
  console.log('here start')
  try {
    const [results] = await pool.query('CALL get_current_attestation_stats()');
    
    console.log(results)

    // Исправляем обработку результатов
    res.json({
      total_failed: results[0][0].total_failed, // пропуски (NULL)
      students_with_3plus_zeros: results[1].map(student => ({
        ...student,
        zero_count: student.fail_count // переименовываем fail_count в zero_count
      })),
      failed_by_group_subject: results[2].map(item => ({
        ...item,
        failed_count: item.zero_count // переименовываем zero_count в failed_count
      }))
    });
    
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка при получении статистики' });
  }
};

// controllers/statsController.js
const excel = require('exceljs');

exports.exportGroupSubjectGrades = async (req, res) => {
  try {
    const { group_id, subject_id } = req.query;
    
    // 1. Получаем данные из БД
    const [students] = await pool.query(`
      SELECT 
        s.student_id,
        s.full_name,
        g.grade,
        am.month,
        u.last_name AS teacher_last_name
      FROM students s
      JOIN student_history sh ON s.student_id = sh.student_id
      JOIN grades g ON g.student_history_id = sh.history_id
      JOIN group_subjects gs ON g.group_subject_id = gs.group_subject_id
      JOIN course_subjects cs ON gs.course_subject_id = cs.course_subject_id
      JOIN active_months am ON g.month_id = am.month_id
      LEFT JOIN teacher_assignments ta ON ta.group_subject_id = gs.group_subject_id
      LEFT JOIN teachers t ON ta.teacher_id = t.teacher_id
      LEFT JOIN users u ON t.user_id = u.user_id
      WHERE sh.group_id = ?
      AND cs.subject_id = ?
      ORDER BY s.full_name, am.month
    `, [group_id, subject_id]);

    // 2. Создаем Excel файл
    const workbook = new excel.Workbook();
    const worksheet = workbook.addWorksheet('Оценки');

    // Заголовки
    worksheet.columns = [
      { header: '№', key: 'id', width: 5 },
      { header: 'Студент', key: 'student', width: 30 },
      { header: 'Преподаватель', key: 'teacher', width: 20 },
      { header: 'Месяц', key: 'month', width: 10 },
      { header: 'Оценка', key: 'grade', width: 10 }
    ];

    // Данные
    students.forEach((student, index) => {
      worksheet.addRow({
        id: index + 1,
        student: student.full_name,
        teacher: student.teacher_last_name || 'Не назначен',
        month: student.month,
        grade: student.grade === null ? 'Н/А' : student.grade
      });
    });

    // 3. Отправляем файл
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=grades_${group_id}_${subject_id}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка при генерации отчета' });
  }
};