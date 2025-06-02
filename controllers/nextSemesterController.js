const db = require('../db');

// Инициализация данных для перехода
exports.init = async (req, res) => {
  console.log('GET: init')
  try {
    // Получаем текущий активный месяц
    const [currentMonth] = await db.query(`
      SELECT month FROM active_months 
      WHERE is_attestation_month = TRUE
      LIMIT 1
    `);

    const currentMonthValue = currentMonth[0].month;

    // Определяем текущий и следующий семестр по месяцу
    const isFirstSemester = ['9', '10', '11', '12'].includes(currentMonthValue);
    const currentSemesterNumber = isFirstSemester ? '1' : '2';
    const nextSemesterNumber = isFirstSemester ? '2' : '1';

    // Получаем ID семестров
    const [currentSemester] = await db.query(`
      SELECT semester_id FROM semesters
      WHERE semester_number = ?
    `, [currentSemesterNumber]);

    const [nextSemester] = await db.query(`
      SELECT semester_id FROM semesters
      WHERE semester_number = ?
    `, [nextSemesterNumber]);

    // Получаем текущий учебный год
    const [currentYear] = await db.query(`
      SELECT year_id FROM academic_years
      WHERE is_current = TRUE
      LIMIT 1
    `);

    if (!currentMonth.length || !currentYear.length) {
      return res.status(400).json({
        success: false,
        message: 'Не удалось определить текущий месяц или учебный год'
      });
    }

    // Проверяем, можно ли выполнить переход (только если текущий месяц - декабрь)
    const canTransition = currentMonthValue === '12';

    res.json({
      success: true,
      data: {
        currentMonth: currentMonthValue,
        currentSemesterNumber,
        nextSemesterNumber,
        currentYearId: currentYear[0].year_id,
        nextSemesterId: nextSemester[0].semester_id,
        canTransition
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при инициализации перехода'
    });
  }
};

// Деактивация текущего месяца
exports.deactivateMonth = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { month } = req.body;

    await connection.query(`
      UPDATE active_months
      SET is_attestation_month = FALSE
      WHERE month = ?
    `, [month]);

    await connection.commit();
    connection.release();

    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при деактивации месяца'
    });
  }
};

// Добавление нового месяца
exports.addMonth = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { month, yearId } = req.body;

    // Добавляем новый месяц как аттестационный
    await connection.query(`
      INSERT INTO active_months (year_id, month, is_attestation_month)
      VALUES (?, ?, TRUE)
    `, [yearId, month]);

    await connection.commit();
    connection.release();

    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при добавлении месяца'
    });
  }
};

// Получение студентов в академотпуске
exports.getAcademicLeaves = async (req, res) => {
  try {
    // Студенты в академе
    const [students] = await db.query(`
      SELECT 
        s.student_id,
        s.full_name,
        sg.group_number,
        c.course_name,
        sem.semester_number,
        ay.year AS academic_year,
        sh.history_id
      FROM students s
      JOIN academic_leaves al ON s.student_id = al.student_id
      JOIN student_history sh ON al.start_history_id = sh.history_id
      JOIN group_history gh ON sh.group_id = gh.group_id 
                          AND sh.year_id = gh.year_id 
                          AND sh.semester_id = gh.semester_id
      JOIN student_groups sg ON sh.group_id = sg.group_id
      JOIN courses c ON gh.course_id = c.course_id
      JOIN semesters sem ON gh.semester_id = sem.semester_id
      JOIN academic_years ay ON gh.year_id = ay.year_id
      WHERE s.status = 'academic_leave'
    `);

    // Доступные группы для перевода
    const [groups] = await db.query(`
      SELECT DISTINCT
        sg.group_id,
        sg.group_number,
        c.course_name,
        c.course_id
      FROM student_groups sg
      JOIN group_history gh ON sg.group_id = gh.group_id
      JOIN courses c ON gh.course_id = c.course_id
      JOIN academic_years ay ON gh.year_id = ay.year_id
      WHERE sg.status = 'active'
      AND ay.is_current = TRUE
      ORDER BY sg.group_number
    `);

    res.json({
      success: true,
      data: {
        students,
        availableGroups: groups
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении студентов в академе'
    });
  }
};

// Обработка решений по академотпускам
exports.processAcademicLeaves = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { decisions } = req.body;

    const [year] = await connection.query(`
      SELECT year_id FROM academic_years
      WHERE is_current = TRUE
      LIMIT 1
    `);
    currentYearId = year[0].year_id;


    for (const decision of decisions) {
      if (decision.action === 'continue') {
        // Возвращаем студента к обучению
        await connection.query(`
          UPDATE students 
          SET status = 'studying' 
          WHERE student_id = ?
        `, [decision.student_id]);

        // Удаляем запись об академе
        await connection.query(`
          DELETE FROM academic_leaves 
          WHERE student_id = ?
        `, [decision.student_id]);

        // Добавляем студента в новую группу
        if (decision.new_group_id) {
          // Получаем курс новой группы
          const [groupCourse] = await connection.query(`
            SELECT course_id FROM group_history
            WHERE group_id = ?
            AND year_id = ?
            LIMIT 1
          `, [decision.new_group_id, currentYearId]);

          if (groupCourse.length > 0) {
            await connection.query(`
              INSERT INTO student_history 
              (student_id, group_id, year_id, semester_id, status)
              VALUES (?, ?, ?, 
                (SELECT semester_id FROM semesters WHERE semester_number = '2'),
                'active')
            `, [
              decision.student_id,
              decision.new_group_id,
              currentYearId
            ]);
          }
        }
      }
      else if (decision.action === 'expel') {
        // Отчисляем студента
        await connection.query(`
          UPDATE students 
          SET status = 'expelled' 
          WHERE student_id = ?
        `, [decision.student_id]);
      }
      // Для продления академа ничего не делаем
    }

    await connection.commit();
    connection.release();

    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обработке решений'
    });
  }
};

// Получение всех активных студентов текущего семестра
exports.getCurrentStudents = async (req, res) => {
  try {
    const [currentYear] = await db.query(`
      SELECT year_id FROM academic_years
      WHERE is_current = TRUE
      LIMIT 1
    `);

    if (!currentYear.length) {
      return res.status(400).json({
        success: false,
        message: 'Текущий учебный год не найден'
      });
    }

    const yearId = currentYear[0].year_id;

    // Получаем активные группы текущего года и семестра
    const [groups] = await db.query(`
      SELECT 
        gh.group_id,
        sg.group_number,
        c.course_name
      FROM group_history gh
      JOIN student_groups sg ON gh.group_id = sg.group_id
      JOIN courses c ON gh.course_id = c.course_id
      WHERE gh.year_id = ?
      AND gh.semester_id = (SELECT semester_id FROM semesters WHERE semester_number = '1')
      AND sg.status = 'active'
      ORDER BY sg.group_number
    `, [yearId]);

    // Для каждой группы получаем студентов
    const result = await Promise.all(groups.map(async group => {
      const [students] = await db.query(`
        SELECT 
          s.student_id,
          s.full_name,
          s.status,
          sh.history_id
        FROM student_history sh
        JOIN students s ON sh.student_id = s.student_id
        WHERE sh.group_id = ?
        AND sh.year_id = ?
        AND sh.semester_id = (SELECT semester_id FROM semesters WHERE semester_number = '1')
        AND sh.status = 'active'
        AND s.status = 'studying'
      `, [group.group_id, yearId]);

      return {
        group_id: group.group_id,
        group_number: group.group_number,
        course_name: group.course_name,
        students: students.map(s => ({
          student_id: s.student_id,
          full_name: s.full_name,
          status: s.status,
          history_id: s.history_id,
          new_status: 'studying', // По умолчанию - продолжает обучение
          new_group_id: null // Для варианта перевода в другую группу
        }))
      };
    }));

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении списка студентов'
    });
  }
};

// Обновление статусов студентов
exports.updateStudentStatuses = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { updates } = req.body;
    const nextSemesterId = 2;

    const [[{ year_id: currentYearID }]] = await db.query(`
      SELECT year_id FROM academic_years
      WHERE is_current = TRUE
      LIMIT 1
    `);

    for (const update of updates) {
      const { student_id, new_status, history_id, new_group_id } = update;

      // 1. Обновляем основной статус студента
      await connection.query(`
        UPDATE students 
        SET status = ?
        WHERE student_id = ?
      `, [new_status, student_id]);

      // 2. Архивируем текущую запись в student_history
      await connection.query(`
        UPDATE student_history
        SET status = 'archived'
        WHERE history_id = ?
      `, [history_id]);

      // 3. Если студент продолжает обучение или уходит в академ
      if (new_status === 'studying' || new_status === 'academic_leave') {
        // Получаем group_id
        let groupId = new_group_id;
        if (!groupId) {
          const [[groupRow]] = await connection.query(`
            SELECT group_id FROM student_history 
            WHERE history_id = ?
          `, [history_id]);
          groupId = groupRow?.group_id;
        }

        if (!groupId) {
          throw new Error(`Не удалось определить группу для студента ${student_id}`);
        }

        // Получаем курс группы в следующем семестре
        const [groupCourse] = await connection.query(`
          SELECT course_id FROM group_history
          WHERE group_id = ?
          AND year_id = ?
          AND semester_id = ?
          LIMIT 1
        `, [groupId, currentYearID, nextSemesterId]);

        if (!groupCourse.length) {
          throw new Error(`Не найдена запись group_history для группы ${groupId} (студент ${student_id})`);
        }

        // Создаём новую запись в student_history
        await connection.query(`
          INSERT INTO student_history 
          (student_id, group_id, year_id, semester_id, status)
          VALUES (?, ?, ?, ?, 'active')
        `, [student_id, groupId, currentYearID, nextSemesterId]);

        // Если студент уходит в академ, добавляем в academic_leaves
        if (new_status === 'academic_leave') {
          const [[{ history_id: newHistoryId }]] = await connection.query(`
            SELECT history_id FROM student_history
            WHERE student_id = ?
            AND year_id = ?
            AND semester_id = ?
            ORDER BY history_id DESC
            LIMIT 1
          `, [student_id, currentYearID, nextSemesterId]);

          await connection.query(`
            INSERT INTO academic_leaves (student_id, start_history_id)
            VALUES (?, ?)
          `, [student_id, newHistoryId]);
        }
      }
    }

    await connection.commit();
    connection.release();
    res.json({ success: true });

  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error(`Ошибка при обновлении статусов студентов: ${err.message}`);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обновлении статусов студентов'
    });
  }
};


// Получение доступных активных групп
exports.getAvailableGroups = async (req, res) => {
  try {
    const [groups] = await db.query(`
      SELECT 
        sg.group_id,
        sg.group_number,
        c.course_name,
        c.course_id
      FROM student_groups sg
      JOIN group_history gh ON sg.group_id = gh.group_id
      JOIN courses c ON gh.course_id = c.course_id
      JOIN academic_years ay ON gh.year_id = ay.year_id
      WHERE sg.status = 'active'
      AND ay.is_current = TRUE
      GROUP BY sg.group_id, c.course_id
      ORDER BY sg.group_number
    `);

    res.json({
      success: true,
      data: groups
    });
  } catch (err) {
    console.error('Ошибка при получении списка групп:', err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении списка групп'
    });
  }
};


// Архивация старых и создание новых group_subjects
exports.processGroupSubjects = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { yearId } = req.body;
    const nextSemesterNumber = 2;

    // Получаем ID 1 и 2 семестров
    const [[firstSemester]] = await connection.query(`
      SELECT semester_id FROM semesters WHERE semester_number = '1'
    `);

    const [[secondSemester]] = await connection.query(`
      SELECT semester_id FROM semesters WHERE semester_number = '2'
    `);

    const firstSemesterId = firstSemester.semester_id;
    const secondSemesterId = secondSemester.semester_id;

    // Получаем группы и курсы за 1 семестр указанного года
    const [currentGroups] = await connection.query(`
      SELECT group_id, course_id FROM group_history
      WHERE year_id = ? AND semester_id = ?
    `, [yearId, firstSemesterId]);

    // Создаем записи в group_history для 2 семестра (если ещё нет)
    for (const group of currentGroups) {
      const [exists] = await connection.query(`
        SELECT 1 FROM group_history
        WHERE group_id = ? AND year_id = ? AND semester_id = ? AND course_id = ?
      `, [group.group_id, yearId, secondSemesterId, group.course_id]);

      if (!exists.length) {
        await connection.query(`
          INSERT INTO group_history (group_id, year_id, semester_id, course_id)
          VALUES (?, ?, ?, ?)
        `, [group.group_id, yearId, secondSemesterId, group.course_id]);
      }
    }

    // Архивируем group_subjects только текущего года и 1 семестра
    await connection.query(`
      UPDATE group_subjects gs
      JOIN course_subjects cs ON gs.course_subject_id = cs.course_subject_id
      JOIN group_history gh ON gs.group_id = gh.group_id
      SET gs.status = 'archived'
      WHERE cs.semester_id = ?
      AND gh.year_id = ?
      AND gs.status = 'active'
    `, [firstSemesterId, yearId]);

    // Получаем активные группы
    const [activeGroups] = await connection.query(`
      SELECT group_id FROM student_groups WHERE status = 'active'
    `);

    // Для каждой группы — получаем курс и создаем новые group_subjects
    for (const group of activeGroups) {
      const [[groupCourse]] = await connection.query(`
        SELECT course_id FROM group_history
        WHERE group_id = ? AND year_id = ? AND semester_id = ?
        LIMIT 1
      `, [group.group_id, yearId, secondSemesterId]);

      if (groupCourse) {
        const [courseSubjects] = await connection.query(`
          SELECT course_subject_id FROM course_subjects
          WHERE course_id = ? AND semester_id = ?
        `, [groupCourse.course_id, secondSemesterId]);

        for (const subject of courseSubjects) {
          await connection.query(`
            INSERT INTO group_subjects (group_id, course_subject_id, status)
            VALUES (?, ?, 'active')
            ON DUPLICATE KEY UPDATE status = 'active'
          `, [group.group_id, subject.course_subject_id]);
        }
      }
    }

    await connection.commit();
    connection.release();

    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error('Ошибка при обработке предметов групп:', err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при обработке предметов групп'
    });
  }
};


// Получение списка всех преподавателей
exports.getTeachers = async (req, res) => {
  try {
    const [teachers] = await db.query(`
      SELECT 
        t.teacher_id,
        TRIM(CONCAT(u.last_name, ' ', u.first_name, ' ', COALESCE(u.middle_name, ''))) AS full_name,
        u.user_id
      FROM teachers t
      JOIN users u ON t.user_id = u.user_id
      WHERE u.is_approved = TRUE
      ORDER BY u.last_name, u.first_name
    `);

    res.json({
      success: true,
      data: teachers
    });
  } catch (err) {
    console.error('Ошибка при получении преподавателей:', err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении списка преподавателей'
    });
  }
};



// Получение group_subjects для назначения преподавателей
exports.getGroupSubjects = async (req, res) => {
  try {
    const [groupSubjects] = await db.query(`
      SELECT 
        gs.group_subject_id,
        sg.group_number,
        s.subject_name
      FROM group_subjects gs
      JOIN student_groups sg ON gs.group_id = sg.group_id
      JOIN course_subjects cs ON gs.course_subject_id = cs.course_subject_id
      JOIN subjects s ON cs.subject_id = s.subject_id
      WHERE gs.status = 'active'
      AND cs.semester_id = (SELECT semester_id FROM semesters WHERE semester_number = '2')
      ORDER BY sg.group_number, s.subject_name
    `);

    res.json({
      success: true,
      data: groupSubjects
    });
  } catch (err) {
    console.error('Ошибка при получении предметов групп:', err);
    res.status(500).json({
      success: false,
      message: 'Ошибка при получении предметов групп'
    });
  }
};


// Назначение преподавателей
exports.assignTeachers = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { assignments } = req.body;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      throw new Error('Нет данных для назначения преподавателей');
    }

    const groupSubjectIds = assignments.map(a => a.group_subject_id);

    // Удаляем старые назначения
    await connection.query(`
      DELETE FROM teacher_assignments 
      WHERE group_subject_id IN (?)
    `, [groupSubjectIds]);

    // Готовим данные для массовой вставки
    const insertValues = assignments.map(a => [a.teacher_id, a.group_subject_id]);

    if (insertValues.length > 0) {
      await connection.query(`
        INSERT INTO teacher_assignments (teacher_id, group_subject_id)
        VALUES ?
      `, [insertValues]);
    }

    await connection.commit();
    connection.release();

    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error('Ошибка при назначении преподавателей:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Ошибка при назначении преподавателей'
    });
  }
};


// Инициализация оценок
exports.initializeGrades = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { yearId, semesterId } = req.body;

    if (!yearId || !semesterId) {
      throw new Error('Не указаны yearId или semesterId');
    }

    // Получаем ID активного месяца (февраль)
    const [month] = await connection.query(`
      SELECT month_id FROM active_months
      WHERE month = '2' AND year_id = ?
      LIMIT 1
    `, [yearId]);

    if (!month.length) {
      throw new Error('Активный месяц не найден');
    }
    const monthId = month[0].month_id;

    // Добавляем пустые оценки для студентов и предметов
    await connection.query(`
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
        AND sh.semester_id = ?
        AND sh.status = 'active'
        AND gs.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM grades g
          WHERE g.student_history_id = sh.history_id
            AND g.group_subject_id = gs.group_subject_id
            AND g.month_id = ?
        )
    `, [monthId, yearId, semesterId, monthId]);

    await connection.commit();
    connection.release();

    res.json({ success: true });
  } catch (err) {
    await connection.rollback();
    connection.release();
    console.error('Ошибка при инициализации оценок:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Ошибка при инициализации оценок'
    });
  }
};