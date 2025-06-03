const db = require('../db');

exports.getCurrentMonth = async (req, res) => {

  console.log(`[GET] /api/month/CurrentMonth`);

  try {
    const [yearRows] = await db.query(`SELECT year_id, year FROM academic_years WHERE is_current = TRUE`);
    const currentYear = yearRows[0];

    const [monthRows] = await db.query(`
      SELECT month FROM active_months
      WHERE year_id = ?
      ORDER BY month_id DESC
      LIMIT 1
    `, [currentYear.year_id]);

    const currentMonth = monthRows[0]?.month;

    res.status(200).json({
      year: currentYear.year,
      month: currentMonth
    });
  } catch (err) {
    console.error('Ошибка при получении текущего месяца:', err);
    res.status(500).json({ error: 'Ошибка при получении текущего месяца' });
  }
};

exports.moveToNextMonth = async (req, res) => {
  console.log(`[GET] /api/month/NextMonth`);

  try {
    const [yearRows] = await db.query(`SELECT year_id FROM academic_years WHERE is_current = TRUE`);
    const currentYearId = yearRows[0].year_id;

    const [monthRows] = await db.query(`
      SELECT month, month_id FROM active_months
      WHERE year_id = ?
      ORDER BY month DESC
      LIMIT 1
    `, [currentYearId]);

    if (!monthRows.length) {
      return res.status(400).json({ error: 'Не найден текущий месяц' });
    }

    const currentMonth = monthRows[0].month;

    const currentMonthId = monthRows[0].month_id;

    console.log('Текущий месяц:', currentMonth);

    // Проверки на крайние месяцы
    if (currentMonth === '12') {
      return res.status(400).json({
        error: 'Перевод невозможен. Рекомендуется перейти на следующий семестр.'
      });
    }

    if (currentMonth === '5') {
      return res.status(400).json({
        error: 'Перевод невозможен. Рекомендуется начать новый учебный год.'
      });
    }

    let nextMonth;
    if (currentMonth === '2') nextMonth = '3';
    else if (currentMonth === '3') nextMonth = '4';
    else if (currentMonth === '4') nextMonth = '5';
    else if (currentMonth === '9') nextMonth = '10';
    else if (currentMonth === '10') nextMonth = '11';
    else if (currentMonth === '11') nextMonth = '12';
    else throw new Error('Некорректный текущий месяц: ' + currentMonth);

    console.log('Следующий месяц:', nextMonth);

    await db.query(`
      UPDATE active_months
      SET is_attestation_month = FALSE
      WHERE month_id = ?
`, [currentMonthId]);

    await db.query(`
      INSERT INTO active_months (year_id, month, is_attestation_month)
      VALUES (?, ?, TRUE)
    `, [currentYearId, nextMonth]);

    const [monthIdRows] = await db.query(`
      SELECT month_id FROM active_months
      WHERE year_id = ? AND month = ?
      ORDER BY month DESC
      LIMIT 1
    `, [currentYearId, nextMonth]);
    const monthId = monthIdRows[0].month_id;

    await db.query(`
      INSERT INTO grades (student_history_id, group_subject_id, month_id, last_edited_by, grade)
      SELECT 
          sh.history_id,
          gs.group_subject_id,
          ?,
          NULL,
          NULL
      FROM student_history sh
      JOIN group_subjects gs ON sh.group_id = gs.group_id
      WHERE sh.year_id = ?
        AND sh.status = 'active'
        AND gs.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM grades g 
          WHERE g.student_history_id = sh.history_id 
            AND g.group_subject_id = gs.group_subject_id 
            AND g.month_id = ?
        )
    `, [monthId, currentYearId, monthId]);

    res.status(200).json({
      message: 'Следующий месяц успешно активирован',
      nextMonth,
      needChangeSemester
    });
  } catch (err) {
    console.error('Ошибка при переходе на следующий месяц:', err);
    res.status(500).json({ error: 'Ошибка при переходе на следующий месяц' });
  }
};

// exports.initializeGrades = async (req, res) => {
//   const connection = await db.getConnection();
//   try {
//       await connection.beginTransaction();

//       const { yearId } = req.body;

//       // 1. Получаем активный месяц (сентябрь)
//       const [month] = await connection.query(`
//           SELECT month_id FROM active_months
//           WHERE year_id = ? AND month = '9'
//           LIMIT 1
//       `, [yearId]);

//       if (!month.length) {
//           throw new Error('Активный месяц не найден');
//       }
//       const monthId = month[0].month_id;

//       // 2. Добавляем пустые оценки для всех активных студентов
//       await connection.query(`
//           INSERT INTO grades (student_history_id, group_subject_id, month_id, last_edited_by grade)
//           SELECT 
//               sh.history_id,
//               gs.group_subject_id,
//               ?,
//               NULL,
//               NULL
//           FROM student_history sh
//           JOIN group_subjects gs ON sh.group_id = gs.group_id
//           WHERE sh.year_id = ?
//           AND sh.status = 'active'
//           AND gs.status = 'active'
//           AND NOT EXISTS (
//               SELECT 1 FROM grades g
//               WHERE g.student_history_id = sh.history_id
//               AND g.group_subject_id = gs.group_subject_id
//               AND g.month_id = ?
//           )
//       `, [monthId, yearId, monthId]);

//       await connection.commit();
//       connection.release();

//       res.json({ success: true });

//   } catch (err) {
//       await connection.rollback();
//       connection.release();
//       console.error(err);
//       res.status(500).json({
//           success: false,
//           message: err.message || 'Ошибка при инициализации оценок'
//       });
//   }
// };
