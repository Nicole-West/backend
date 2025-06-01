// controllers/statsController.js
const pool = require('../db');

exports.getCurrentStats = async (req, res) => {
  console.log('[GET] /api/stats/current-zeros')
  try {
    const [results] = await pool.query('CALL get_current_attestation_stats()');

    // console.log(results)

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

exports.getGroupSubjects = async (req, res) => {
  try {
    console.log('[GET] /api/stats/group-subjects')
    const { group_id } = req.query;

    const [subjects] = await pool.query(`
      SELECT DISTINCT s.subject_id, s.subject_name
      FROM group_subjects gs
      JOIN course_subjects cs ON gs.course_subject_id = cs.course_subject_id
      JOIN subjects s ON cs.subject_id = s.subject_id
      JOIN group_history gh ON gs.group_id = gh.group_id
      WHERE gs.group_id = ?
      AND gs.status = 'active'
      AND gh.year_id = (SELECT year_id FROM academic_years WHERE is_current = TRUE)
      ORDER BY s.subject_name
    `, [group_id]);

    res.json(subjects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка при получении предметов группы' });
  }
};

// Получение списка всех активных групп
exports.getGroups = async (req, res) => {
  try {
    const [groups] = await pool.query(`
      SELECT group_id, group_number 
      FROM student_groups 
      WHERE status = 'active'
      ORDER BY group_number
    `);
    res.json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка при получении групп' });
  }
};

// Получение списка всех предметов
exports.getSubjects = async (req, res) => {
  try {
    const [subjects] = await pool.query(`
      SELECT subject_id, subject_name 
      FROM subjects 
      ORDER BY subject_name
    `);
    res.json(subjects);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка при получении предметов' });
  }
};

const XLSX = require('xlsx');


exports.exportGrades = async (req, res) => {
  try {
    const { group_id, subject_id } = req.query;

    // 1. Получаем текущий аттестационный месяц
    const [currentMonth] = await pool.query(`
      SELECT am.month_id, am.month
      FROM active_months am
      JOIN academic_years ay ON am.year_id = ay.year_id
      WHERE ay.is_current = TRUE
      AND am.is_attestation_month = TRUE
      ORDER BY am.month_id DESC
      LIMIT 1
    `);

    if (!currentMonth.length) {
      return res.status(400).json({ message: 'Нет текущего аттестационного месяца' });
    }

    // 2. Получаем данные
    const [grades] = await pool.query(`
      SELECT 
        s.full_name,
        g.grade,
        grp.group_number,
        sub.subject_name
      FROM grades g
      JOIN student_history sh ON g.student_history_id = sh.history_id
      JOIN students s ON sh.student_id = s.student_id
      JOIN student_groups grp ON sh.group_id = grp.group_id
      JOIN group_subjects gs ON g.group_subject_id = gs.group_subject_id
      JOIN course_subjects cs ON gs.course_subject_id = cs.course_subject_id
      JOIN subjects sub ON cs.subject_id = sub.subject_id
      JOIN active_months am ON g.month_id = am.month_id
      WHERE sh.group_id = ?
      AND cs.subject_id = ?
      AND g.month_id = ?
      ORDER BY s.full_name
    `, [group_id, subject_id, currentMonth[0].month_id]);

    if (!grades.length) {
      return res.status(404).json({ message: 'Нет данных для экспорта' });
    }

    // 3. Подготовка данных для Excel
    const excelData = [
      ['№', 'ФИО студента', 'Оценка'],
      ...grades.map((row, index) => [
        index + 1,
        row.full_name,
        row.grade === null ? 'Н/А' : row.grade
      ])
    ];

    // 4. Создаем книгу Excel
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);

    // Устанавливаем ширину столбцов
    worksheet['!cols'] = [
      { wch: 5 },  // Ширина для колонки № (5 символов)
      { wch: Math.max(...grades.map(row => row.full_name.length)) + 5 },  // Ширина для ФИО (макс. длина + запас)
      { wch: 10 }  // Ширина для оценки (10 символов)
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Оценки');

    // 5. Генерируем имя файла (удаляем недопустимые символы)
    // const groupName = grades[0].group_number.replace(/[^\wа-яА-Я-]/g, '_');
    // console.log(groupName)
    // const subjectName = grades[0].subject_name.replace(/[^\wа-яА-Я-]/g, '_');
    // console.log(subjectName)
    // const monthName = (currentMonth[0].month).replace(/[^\wа-яА-Я-]/g, '_');
    // console.log(monthName)
    // const fileName = `Оценки_${groupName}_${subjectName}_${monthName}.xlsx`;
    // console.log(fileName)

    // // 6. Отправляем файл
    // res.setHeader(
    //   'Content-Type',
    //   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    // );
    // res.setHeader(
    //   'Content-Disposition',
    //   `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
    // );

    // const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    // res.send(excelBuffer);

    // 6. Подготовка данных для ответа
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    // Формируем имя файла
    const groupName = (grades[0].group_number || 'группа').replace(/[^\wа-яА-Я-]/g, '_');
    const subjectName = (grades[0].subject_name || 'предмет').replace(/[^\wа-яА-Я-]/g, '_');
    const monthName = (currentMonth[0].month || 'месяц').replace(/[^\wа-яА-Я-]/g, '_');
    const fileName = `Оценки_${groupName}_${subjectName}_${monthName}.xlsx`;
    fileName = fileName.replace(/[^а-яА-ЯёЁ\w\-\.]/g, '_');

    // Отправляем как бинарные данные с дополнительными заголовками
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('X-File-Name', encodeURIComponent(fileName)); // Дополнительный заголовок с именем
    res.send(excelBuffer);

  } catch (err) {
    console.error('Ошибка экспорта:', err);
    res.status(500).json({
      message: 'Ошибка при экспорте оценок',
      error: err.message
    });
  }
};